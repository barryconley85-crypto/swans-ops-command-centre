# End-of-day report delivery design

The selected approach is a **free precise external scheduler** that calls a secured Vercel report endpoint at **17:00 Europe/London**. This is preferable to the built-in Vercel Hobby scheduler for the stated timing requirement because Hobby permits only one daily run and its invocation can occur at any point within the configured hour.

The external scheduler will call the endpoint with a long random bearer secret (`REPORT_CRON_SECRET`). The endpoint will use a server-only Firebase service-account credential to read task data and a server-only email-provider key to deliver the report to `bc@swanstravel.com`. It will write a sent-date marker to prevent duplicate reports for the same local operational date.

The external scheduler account must be set up once and can send authenticated HTTP requests on a Europe/London schedule. Delivery still depends on configuring the email provider’s free-tier sender credentials.

## Sources

- [Vercel Cron Jobs](https://vercel.com/docs/cron-jobs): Vercel cron requests use UTC schedules and call production function endpoints.
- [Vercel Cron usage and pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing): Hobby allows once-daily jobs with per-hour timing precision.
- [Vercel Cron management](https://vercel.com/docs/cron-jobs/manage-cron-jobs): scheduled endpoints should authenticate callers and be idempotent.
- [cron-job.org](https://cron-job.org/en/): describes free custom HTTP scheduling.
- [cron-job.org FAQ](https://cron-job.org/en/faq/): documents custom headers, POST requests and schedule timing caveats.
