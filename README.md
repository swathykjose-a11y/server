# Dainty Dazzle - Backend Server

High-performance, scalable TypeScript backend built with **Hono** and **Node.js**, designed to handle high-traffic e-commerce and automated dropshipping workflows.

---

## 🏛️ System Architecture

```
                       [ Client / Next.js ]
                                |
                   (HTTPS / X-Request-Id / Idempotency-Key)
                                |
                                v
               [ Hono API Gateway (@hono/node-server) ]
           /           |                |             \
  [ Rate Limiter ]  [ Idempotency ]  [ Sentry ]   [ Structured Logger ]
         \             |                |             /
                       v                v
            [ Upstash Redis ]    [ PostgreSQL Pool ]
          (Distributed Locks /      (Drizzle ORM)
           Sliding Rate Limits /   - Orders & Items
            Cache-Aside TTL)       - Payment Txns
                                   - Products & Collections
                                   - Audit Logs
                                        ^
                                        | (Polls unconfirmed txns)
                                        |
                         [ Background Polling Worker ]
                         (Distributed Lock: 60s tick)
                                        |
                 +----------------------+----------------------+
                 |                                             |
                 v                                             v
       [ PhonePe Gateway ]                            [ Resend Email ]
  (Check status /pg/v1/status)                 - Customer order confirmation
                                               - Dropship alert to:
                                                 bhavartheankit@gmail.com
```

---

## ⚡ Core Features

### 1. High-Traffic Scalability with Upstash Redis
- **Cache-Aside Pattern**: Products, collections, and CMS banners are cached in Redis with TTL and invalidated on updates.
- **Distributed Sliding-Window Rate Limiting**: Protects all public endpoints against brute force and DDoS attacks.
- **Distributed Locking (`SET lock:<key> NX EX <ttl>`)**: Coordinates tasks across multiple backend instances so that background reconciliation jobs never clash or duplicate work.

### 2. Strict Idempotency (`Idempotency-Key`)
- Prevents double charging or duplicate order placement when network timeouts occur or users click "Place Order" repeatedly.
- Supports the `Idempotency-Key` HTTP header:
  - **In Progress**: Concurrent requests with the same key immediately return `409 Conflict`.
  - **Completed**: Subsequent requests replay the cached response with the `X-Idempotency-Replay: true` header.

### 3. Database Polling Worker (PhonePe Payment Reconciliation)
- In high-volume e-commerce, webhooks may experience network latency or customers might close their browser before the redirect returns.
- A dedicated background polling worker runs every 60 seconds with an Upstash Redis distributed lock:
  - Selects pending payment transactions created between 2 and 60 minutes ago (`index on (status, created_at)`).
  - Queries the PhonePe `/pg/v1/status` API to determine authoritative status.
  - Automatically reconciles orders to `PAID` / `CONFIRMED` and triggers Resend emails.
  - Logs execution details in `polling_audit_logs`.

### 4. Database Schema & Indexing (PostgreSQL + Drizzle ORM)
- Optimized indexes designed for scale:
  - `orders`: Unique index on `order_number`, index on `customer_email`, compound index on `(status, payment_status, created_at)` for instant aggregation and polling.
  - `payment_transactions`: Unique index on `merchant_transaction_id`, index on `order_id`, composite index on `(status, created_at)`.
  - `products`: Unique index on `handle`, indexes on `is_active`, `available_for_sale`, and `created_at`.
- Connection pooling tuned for high concurrency with automatic cleanup on graceful shutdown.

### 5. Resend Email Service & Error Monitoring
- **Customer Confirmation**: Sends itemized HTML receipt with order number, estimated delivery (5–7 days), and delivery address.
- **Admin Dropshipping Alert**: Sends direct notifications to **`swathykjose@gmail.com`** with customer delivery address, items ordered, and instructions to order from the supplier website.
- **Developer Error Alerts**: Real-time error alerts dispatched to **`bhavartheankit@gmail.com`** whenever an unhandled 500 error or server issue occurs, with full stack traces and request correlation IDs.

### 6. PhonePe Payment Gateway
- Standard Indian checkout supporting UPI, Credit/Debit Cards, and NetBanking.
- Secure SHA256 checksum generation & validation: `SHA256(payload + endpoint + saltKey) + "###" + saltIndex`.
- Webhook signature verification and payment status check API integration.

### 7. Sentry Error Tracking & Structured Logging
- Automatic error capture on unhandled exceptions and validation errors.
- Correlation tracking via `X-Request-Id`.

---

## 🚀 Getting Started

### 1. Prerequisites
- Node.js v20+ or v22+
- PostgreSQL database (Local, Supabase, Neon, or AWS RDS)
- Upstash Redis account
- Resend API key
- PhonePe merchant credentials

### 2. Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Configure your credentials in `.env`:
- `DATABASE_URL`: Your PostgreSQL connection string.
- `UPSTASH_REDIS_REST_URL` & `UPSTASH_REDIS_REST_TOKEN`: Upstash Redis REST credentials.
- `RESEND_API_KEY`: Resend API key.
- `ADMIN_NOTIFICATION_EMAIL`: `swathykjose@gmail.com` (for order dropshipping notifications)
- `DEVELOPER_ALERT_EMAIL`: `bhavartheankit@gmail.com` (for server error and exception alerts)
- `PHONEPE_MERCHANT_ID`, `PHONEPE_SALT_KEY`, `PHONEPE_SALT_INDEX`.
- `SENTRY_DSN`: Optional Sentry DSN for error monitoring.

### 3. Install Dependencies
```bash
npm install
# or
bun install
```

### 4. Database Setup & Seed
```bash
# Push schema to database
npm run db:generate
npm run db:migrate

# Seed with initial jewelry catalog
npm run db:seed
```

### 5. Run Development Server
```bash
npm run dev
```
The server will start on `http://localhost:8787`.

---

## 📡 API Endpoints Reference

### Public API
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Server health check (DB & Redis connectivity status) |
| `GET` | `/api/products` | List products with pagination and category filtering |
| `GET` | `/api/products/:handle` | Get single product by handle |
| `GET` | `/api/products/search?q=...` | Live product search |
| `GET` | `/api/collections` | List all collections |
| `GET` | `/api/collections/:handle` | Get collection with its products |
| `GET` | `/api/cms/:section` | Get CMS banners (`hero`, `featured`, `editorial`, `story`, `bottom-banner`) |
| `POST` | `/api/orders` | Place dropshipping order (`Idempotency-Key` supported) |
| `GET` | `/api/orders/:id` | Lookup customer order |
| `POST` | `/api/payments/initiate` | Initiate PhonePe checkout (`Idempotency-Key` supported) |
| `POST` | `/api/payments/phonepe-webhook` | PhonePe server-to-server callback |
| `GET` | `/api/payments/status/:txnId` | Verify transaction status with PhonePe |

### Admin API (Protected by `X-Admin-Key`)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/admin/orders` | List all orders with dropship fulfillment details |
| `PATCH` | `/api/admin/orders/:id` | Update dropship status (`ordered_from_supplier`, `shipped`, tracking URL) |
| `POST` | `/api/admin/products` | Create or update a product |
| `DELETE` | `/api/admin/products/:id` | Deactivate a product |
| `POST` | `/api/admin/cms/:section` | Update CMS section content |
