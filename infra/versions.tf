terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
    local = {
      source  = "hashicorp/local"
      version = "~> 2.5"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # Settings live in infra/backend.hcl, written by scripts/bootstrap-state.sh and
  # not committed:  terraform init -backend-config=backend.hcl
  backend "s3" {}
}

# CloudFront certificates must live in us-east-1, so everything does.
provider "aws" {
  region = "us-east-1"

  default_tags {
    tags = {
      Project   = var.name
      ManagedBy = "terraform"
    }
  }
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}
