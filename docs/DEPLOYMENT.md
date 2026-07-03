# Deployment Guide

WholesalePOS is structured for container deployment.

## Deployment Checklist

- Set production-grade `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`.
- Use a managed PostgreSQL database or persistent Docker volume.
- Run Prisma migrations before serving traffic.
- Terminate TLS at the load balancer or reverse proxy.
- Restrict CORS to trusted frontend origins.
- Enable log collection for backend stdout.
- Back up PostgreSQL on a fixed retention schedule.
