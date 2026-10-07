resource "aws_cognito_user_pool" "main" {
  name           = var.name
  user_pool_tier = "LITE"

  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  # Invite-only: users are created by an admin, nobody can self-register.
  admin_create_user_config {
    allow_admin_create_user_only = true
  }

  password_policy {
    minimum_length                   = 12
    require_lowercase                = true
    require_uppercase                = true
    require_numbers                  = true
    require_symbols                  = false
    temporary_password_validity_days = 7
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }
}

resource "random_string" "auth_domain_suffix" {
  length  = 8
  upper   = false
  special = false
}

resource "aws_cognito_user_pool_domain" "main" {
  domain       = "${var.name}-${random_string.auth_domain_suffix.result}"
  user_pool_id = aws_cognito_user_pool.main.id
}

# Public browser client: authorization code flow with PKCE, no secret.
resource "aws_cognito_user_pool_client" "web" {
  name         = "${var.name}-web"
  user_pool_id = aws_cognito_user_pool.main.id

  generate_secret                      = false
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["openid", "email", "profile"]
  supported_identity_providers         = ["COGNITO"]
  explicit_auth_flows                  = ["ALLOW_USER_SRP_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"]
  prevent_user_existence_errors        = "ENABLED"

  callback_urls = ["https://${var.domain_name}/", "http://localhost:3000/"]
  logout_urls   = ["https://${var.domain_name}/", "http://localhost:3000/"]

  access_token_validity  = 1
  id_token_validity      = 1
  refresh_token_validity = 30
  token_validity_units {
    access_token  = "hours"
    id_token      = "hours"
    refresh_token = "days"
  }
}

locals {
  cognito_issuer = "https://cognito-idp.${data.aws_region.current.region}.amazonaws.com/${aws_cognito_user_pool.main.id}"
  cognito_domain = "https://${aws_cognito_user_pool_domain.main.domain}.auth.${data.aws_region.current.region}.amazoncognito.com"
}
