# --- Network: default VPC, one public subnet in an AZ that offers the instance type ---

data "aws_vpc" "default" {
  default = true
}

data "aws_ec2_instance_type_offerings" "api" {
  location_type = "availability-zone"
  filter {
    name   = "instance-type"
    values = [var.instance_type]
  }
}

data "aws_subnet" "api" {
  vpc_id            = data.aws_vpc.default.id
  availability_zone = sort(data.aws_ec2_instance_type_offerings.api.locations)[0]
  default_for_az    = true
}

data "aws_ec2_managed_prefix_list" "cloudfront" {
  name = "com.amazonaws.global.cloudfront.origin-facing"
}

resource "aws_security_group" "api" {
  name        = "${var.name}-api"
  description = "API instance: reachable only from CloudFront"
  vpc_id      = data.aws_vpc.default.id
}

resource "aws_vpc_security_group_ingress_rule" "api_from_cloudfront" {
  security_group_id = aws_security_group.api.id
  description       = "CloudFront origin-facing addresses"
  prefix_list_id    = data.aws_ec2_managed_prefix_list.cloudfront.id
  ip_protocol       = "tcp"
  from_port         = var.api_port
  to_port           = var.api_port
}

resource "aws_vpc_security_group_egress_rule" "api_https" {
  security_group_id = aws_security_group.api.id
  description       = "Cognito, S3 and SSM"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
}

# --- Instance ---

data "aws_ssm_parameter" "al2023_arm64" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64"
}

resource "aws_iam_role" "api" {
  name = "${var.name}-api"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

# Session Manager and Run Command; there is no SSH.
resource "aws_iam_role_policy_attachment" "api_ssm" {
  role       = aws_iam_role.api.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_role_policy" "api_artifacts" {
  name = "read-artifacts"
  role = aws_iam_role.api.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "s3:GetObject"
      Resource = "${aws_s3_bucket.artifacts.arn}/api/*"
    }]
  })
}

resource "aws_iam_instance_profile" "api" {
  name = "${var.name}-api"
  role = aws_iam_role.api.name
}

resource "aws_instance" "api" {
  ami                    = data.aws_ssm_parameter.al2023_arm64.value
  instance_type          = var.instance_type
  subnet_id              = data.aws_subnet.api.id
  vpc_security_group_ids = [aws_security_group.api.id]
  iam_instance_profile   = aws_iam_instance_profile.api.name

  # The default for this family bills for bursting past the baseline. The API
  # idles far below it, so be throttled rather than charged if that ever changes.
  credit_specification {
    cpu_credits = "standard"
  }

  metadata_options {
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
  }

  root_block_device {
    volume_type = "gp3"
    volume_size = 8
    encrypted   = true
  }

  tags = {
    Name = "${var.name}-api"
  }

  lifecycle {
    # A newer AMI should not replace the instance (and its disk) on the next apply.
    ignore_changes = [ami]
  }
}

resource "aws_eip" "api" {
  domain   = "vpc"
  instance = aws_instance.api.id

  tags = {
    Name = "${var.name}-api"
  }
}

# --- Artifacts and the deploy command ---

resource "aws_s3_bucket" "artifacts" {
  bucket = "${var.name}-artifacts-${data.aws_caller_identity.current.account_id}"
}

resource "aws_s3_bucket_public_access_block" "artifacts" {
  bucket                  = aws_s3_bucket.artifacts.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id
  rule {
    id     = "expire-old-builds"
    status = "Enabled"
    filter {
      prefix = "api/"
    }
    expiration {
      days = 90
    }
  }
}

# The only thing CI may run on the instance. The commit SHA is the sole input
# and is pattern-checked by SSM, so the script cannot be steered into other commands.
resource "aws_ssm_document" "deploy_api" {
  name            = "${var.name}-deploy-api"
  document_type   = "Command"
  document_format = "YAML"
  target_type     = "/AWS::EC2::Instance"

  content = yamlencode({
    schemaVersion = "2.2"
    description   = "Install a build of the API from the artifacts bucket and restart it"
    parameters = {
      sha = {
        type           = "String"
        description    = "Git commit SHA of the build"
        allowedPattern = "^[0-9a-f]{40}$"
      }
    }
    mainSteps = [{
      action = "aws:runShellScript"
      name   = "deploy"
      inputs = {
        timeoutSeconds = "120"
        runCommand = split("\n", templatefile("${path.module}/deploy-api.sh.tftpl", {
          name           = var.name
          bucket         = aws_s3_bucket.artifacts.id
          port           = var.api_port
          cognito_issuer = local.cognito_issuer
          client_id      = aws_cognito_user_pool_client.web.id
        }))
      }
    }]
  })
}
