output "load_balancer_dns_name" {
  description = "Point a DNS record (CNAME or alias) for domain_name at this."
  value       = aws_lb.main.dns_name
}

output "ecr_repositories" {
  description = "Push the api, migrate and web images here, tagged with image_tag."
  value       = { for name, repo in aws_ecr_repository.app : name => repo.repository_url }
}

output "migrate_command" {
  description = "Runs the database migrations as a one-off task. Run it before updating the services."
  value       = "aws ecs run-task --cluster ${aws_ecs_cluster.main.name} --launch-type FARGATE --task-definition ${aws_ecs_task_definition.migrate.family} --network-configuration 'awsvpcConfiguration={subnets=[${join(",", aws_subnet.public[*].id)}],securityGroups=[${aws_security_group.tasks.id}],assignPublicIp=ENABLED}'"
}

output "database_endpoint" {
  description = "Private RDS endpoint (reachable only from the tasks)."
  value       = aws_db_instance.main.address
}
