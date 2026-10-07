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

  # Bucket is created once by scripts/bootstrap-state.sh
  backend "s3" {
    bucket       = "nested-tfstate-ACCOUNT_ID"
    key          = "nested.tfstate"
    region       = "us-east-1"
    encrypt      = true
    use_lockfile = true
  }
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
