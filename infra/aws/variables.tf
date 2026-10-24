variable "region" {
  description = "AWS region."
  type        = string
  default     = "ap-southeast-2"
}

variable "environment" {
  description = "Name used in resource names and tags."
  type        = string
  default     = "demo"
}

variable "domain_name" {
  description = "The public hostname, e.g. wageguard.example.com. The browser origin and cookies depend on it."
  type        = string
}

variable "certificate_arn" {
  description = "ARN of an issued ACM certificate for domain_name, in the same region."
  type        = string
}

variable "image_tag" {
  description = "Tag of the api, migrate and web images pushed to the ECR repositories."
  type        = string
}

variable "api_cpu" {
  description = "Fargate CPU units for the API task (1024 = 1 vCPU)."
  type        = number
  default     = 512
}

variable "api_memory" {
  description = "Fargate memory (MiB) for the API task."
  type        = number
  default     = 1024
}

variable "web_cpu" {
  description = "Fargate CPU units for the web task."
  type        = number
  default     = 256
}

variable "web_memory" {
  description = "Fargate memory (MiB) for the web task."
  type        = number
  default     = 512
}

variable "db_instance_class" {
  description = "RDS instance class."
  type        = string
  default     = "db.t4g.micro"
}

variable "db_backup_retention_days" {
  description = "Days of automated RDS backups (point-in-time recovery window)."
  type        = number
  default     = 7
}

variable "log_retention_days" {
  description = "CloudWatch log retention."
  type        = number
  default     = 14
}
