# Images in ECR, tasks on ECS Fargate, logs in CloudWatch.

resource "aws_ecr_repository" "app" {
  for_each             = toset(["api", "migrate", "web"])
  name                 = "${local.name}-${each.key}"
  image_tag_mutability = "IMMUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_cloudwatch_log_group" "app" {
  for_each          = toset(["api", "migrate", "web"])
  name              = "/ecs/${local.name}/${each.key}"
  retention_in_days = var.log_retention_days
}

resource "aws_ecs_cluster" "main" {
  name = local.name

  setting {
    name  = "containerInsights"
    value = "disabled"
  }
}

# Task execution role: pulls images, writes logs, and reads only the application secrets below.
data "aws_iam_policy_document" "ecs_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "execution" {
  name               = "${local.name}-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}

resource "aws_iam_role_policy_attachment" "execution" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

data "aws_iam_policy_document" "read_database_url" {
  statement {
    actions = ["secretsmanager:GetSecretValue"]
    resources = [
      aws_secretsmanager_secret.database_url.arn,
      aws_secretsmanager_secret.migrate_database_url.arn,
      aws_secretsmanager_secret.totp_encryption_key.arn,
      aws_secretsmanager_secret.smtp_url.arn,
    ]
  }
}

resource "aws_iam_role_policy" "read_database_url" {
  name   = "read-database-url"
  role   = aws_iam_role.execution.id
  policy = data.aws_iam_policy_document.read_database_url.json
}

locals {
  origin = "https://${var.domain_name}"

  log_config = {
    for name in ["api", "migrate", "web"] : name => {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.app[name].name
        awslogs-region        = var.region
        awslogs-stream-prefix = name
      }
    }
  }

  api_secrets = [
    { name = "DATABASE_URL", valueFrom = aws_secretsmanager_secret.database_url.arn },
    { name = "TOTP_ENCRYPTION_KEY", valueFrom = aws_secretsmanager_secret.totp_encryption_key.arn },
    { name = "SMTP_URL", valueFrom = aws_secretsmanager_secret.smtp_url.arn },
  ]
  migrate_secret = [{ name = "DATABASE_URL", valueFrom = aws_secretsmanager_secret.migrate_database_url.arn }]
}

resource "aws_ecs_task_definition" "api" {
  family                   = "${local.name}-api"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.api_cpu
  memory                   = var.api_memory
  execution_role_arn       = aws_iam_role.execution.arn

  container_definitions = jsonencode([{
    name         = "api"
    image        = "${aws_ecr_repository.app["api"].repository_url}:${var.image_tag}"
    essential    = true
    portMappings = [{ containerPort = 3001, protocol = "tcp" }]
    environment = [
      { name = "NODE_ENV", value = "production" },
      { name = "COOKIE_SECURE", value = "true" },
      { name = "ALLOWED_ORIGINS", value = local.origin },
      # One trusted hop: the load balancer. Rate limits then apply per real client.
      { name = "TRUST_PROXY", value = "1" },
      # Links in sign-up and password reset emails point at the public site.
      { name = "APP_BASE_URL", value = local.origin },
      { name = "MAIL_FROM", value = var.mail_from },
    ]
    secrets          = local.api_secrets
    logConfiguration = local.log_config["api"]
    stopTimeout      = 30
  }])
}

# One-off migration task, run before each release (see docs/deployment.md). Never part of a service.
resource "aws_ecs_task_definition" "migrate" {
  family                   = "${local.name}-migrate"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.execution.arn

  container_definitions = jsonencode([{
    name             = "migrate"
    image            = "${aws_ecr_repository.app["migrate"].repository_url}:${var.image_tag}"
    essential        = true
    secrets          = local.migrate_secret
    logConfiguration = local.log_config["migrate"]
  }])
}

resource "aws_ecs_task_definition" "web" {
  family                   = "${local.name}-web"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.web_cpu
  memory                   = var.web_memory
  execution_role_arn       = aws_iam_role.execution.arn

  container_definitions = jsonencode([{
    name             = "web"
    image            = "${aws_ecr_repository.app["web"].repository_url}:${var.image_tag}"
    essential        = true
    portMappings     = [{ containerPort = 3000, protocol = "tcp" }]
    environment      = [{ name = "NODE_ENV", value = "production" }]
    logConfiguration = local.log_config["web"]
    stopTimeout      = 30
  }])
}

# The API runs as a single task: its rate-limit counters are in memory (docs/known-limitations.md).
resource "aws_ecs_service" "api" {
  name            = "api"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = aws_subnet.public[*].id
    security_groups  = [aws_security_group.tasks.id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "api"
    container_port   = 3001
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  depends_on = [aws_lb_listener_rule.api]
}

resource "aws_ecs_service" "web" {
  name            = "web"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.web.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = aws_subnet.public[*].id
    security_groups  = [aws_security_group.tasks.id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.web.arn
    container_name   = "web"
    container_port   = 3000
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  depends_on = [aws_lb_listener.https]
}
