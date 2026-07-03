# Deployment Guide

WholesalePOS is currently structured for single-device local deployment. The normal setup does not require Docker, PostgreSQL, or a server running elsewhere.

## Deployment Checklist

- Set production-grade `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`.
- Run Prisma migrations before first use so `database/wholesalepos.sqlite` is created.
- Keep the installed app folder on a reliable local drive.
- Back up `database/wholesalepos.sqlite` on a fixed retention schedule.
- Restrict CORS to the local frontend origin for the desktop build.
- Enable log collection for backend stdout.
