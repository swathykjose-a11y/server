CREATE TABLE "cms_sections" (
	"id" text PRIMARY KEY NOT NULL,
	"section_key" text NOT NULL,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collection_products" (
	"collection_id" text NOT NULL,
	"product_id" text NOT NULL,
	"sort_order" integer DEFAULT 0,
	CONSTRAINT "collection_products_collection_id_product_id_pk" PRIMARY KEY("collection_id","product_id")
);
--> statement-breakpoint
CREATE TABLE "collections" (
	"id" text PRIMARY KEY NOT NULL,
	"handle" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"image_url" text,
	"image_alt" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_variants" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"title" text NOT NULL,
	"available_for_sale" boolean DEFAULT true NOT NULL,
	"quantity_available" integer DEFAULT 0,
	"price" numeric(10, 2) NOT NULL,
	"compare_at_price" numeric(10, 2),
	"currency" text DEFAULT 'INR' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" text PRIMARY KEY NOT NULL,
	"handle" text NOT NULL,
	"title" text NOT NULL,
	"description_html" text DEFAULT '' NOT NULL,
	"available_for_sale" boolean DEFAULT true NOT NULL,
	"total_inventory" integer DEFAULT 0,
	"min_price" numeric(10, 2) NOT NULL,
	"compare_at_price" numeric(10, 2),
	"currency" text DEFAULT 'INR' NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"images" jsonb DEFAULT '[]'::jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"product_id" text NOT NULL,
	"product_title" text NOT NULL,
	"product_handle" text NOT NULL,
	"variant_id" text NOT NULL,
	"variant_title" text NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"image_url" text
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" text PRIMARY KEY NOT NULL,
	"order_number" text NOT NULL,
	"customer_first_name" text NOT NULL,
	"customer_last_name" text DEFAULT '',
	"customer_email" text NOT NULL,
	"customer_phone" text NOT NULL,
	"address_line1" text NOT NULL,
	"address_line2" text,
	"city" text NOT NULL,
	"state" text NOT NULL,
	"postal_code" text NOT NULL,
	"country" text DEFAULT 'India' NOT NULL,
	"subtotal" numeric(10, 2) NOT NULL,
	"shipping_fee" numeric(10, 2) DEFAULT '0' NOT NULL,
	"total" numeric(10, 2) NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"payment_method" text DEFAULT 'cod' NOT NULL,
	"payment_status" text DEFAULT 'pending' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"supplier_order_id" text,
	"supplier_order_url" text,
	"supplier_cost" numeric(10, 2),
	"supplier_notes" text,
	"courier_tracking_number" text,
	"courier_tracking_url" text,
	"idempotency_key" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"merchant_transaction_id" text NOT NULL,
	"provider" text DEFAULT 'phonepe' NOT NULL,
	"amount_in_paise" numeric NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"provider_reference_id" text,
	"provider_response_code" text,
	"raw_response" jsonb,
	"poll_count" integer DEFAULT 0,
	"last_polled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "polling_audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"job_name" text NOT NULL,
	"worker_id" text NOT NULL,
	"records_checked" integer DEFAULT 0,
	"records_updated" integer DEFAULT 0,
	"status" text NOT NULL,
	"details" jsonb,
	"duration_ms" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "collection_products" ADD CONSTRAINT "collection_products_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_products" ADD CONSTRAINT "collection_products_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cms_section_key_idx" ON "cms_sections" USING btree ("section_key");--> statement-breakpoint
CREATE INDEX "col_prod_col_id_idx" ON "collection_products" USING btree ("collection_id");--> statement-breakpoint
CREATE INDEX "col_prod_prod_id_idx" ON "collection_products" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "collections_handle_idx" ON "collections" USING btree ("handle");--> statement-breakpoint
CREATE INDEX "variants_product_id_idx" ON "product_variants" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "variants_available_idx" ON "product_variants" USING btree ("available_for_sale");--> statement-breakpoint
CREATE UNIQUE INDEX "products_handle_idx" ON "products" USING btree ("handle");--> statement-breakpoint
CREATE INDEX "products_active_idx" ON "products" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "products_available_idx" ON "products" USING btree ("available_for_sale");--> statement-breakpoint
CREATE INDEX "products_created_at_idx" ON "products" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "order_items_order_id_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_items_product_id_idx" ON "order_items" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_order_number_idx" ON "orders" USING btree ("order_number");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_idempotency_key_idx" ON "orders" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "orders_customer_email_idx" ON "orders" USING btree ("customer_email");--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "orders_payment_status_idx" ON "orders" USING btree ("payment_status");--> statement-breakpoint
CREATE INDEX "orders_created_at_idx" ON "orders" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "orders_status_payment_created_idx" ON "orders" USING btree ("status","payment_status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_merchant_txn_id_idx" ON "payment_transactions" USING btree ("merchant_transaction_id");--> statement-breakpoint
CREATE INDEX "payment_order_id_idx" ON "payment_transactions" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "payment_status_idx" ON "payment_transactions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "payment_status_created_idx" ON "payment_transactions" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "polling_audit_created_idx" ON "polling_audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "polling_audit_job_idx" ON "polling_audit_logs" USING btree ("job_name");