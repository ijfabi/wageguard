# Optional AWS demo deployment. Written and validated, never applied: applying it creates billable
# resources and must only happen with explicit approval. See docs/deployment.md.

terraform {
  required_version = ">= 1.16.5, < 2.0.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "6.68.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "3.7.2"
    }
  }

  # Keep state somewhere encrypted and access-controlled (for example an S3 bucket with
  # versioning and encryption): it contains the generated database password.
  # backend "s3" {}
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project     = "wageguard"
      Environment = var.environment
      ManagedBy   = "terraform"
      Data        = "synthetic-only"
    }
  }
}
