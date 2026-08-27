import Stripe from "stripe";

const allowIncomplete = process.argv.includes("--allow-incomplete");
const checks = [];
const requiredWebhookEvents = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
]);

function record(scope, passed, detail) {
  checks.push({ scope, passed, detail });
}

function value(name) {
  return process.env[name]?.trim() || undefined;
}

function booleanValue(name, fallback = false) {
  const configured = value(name);
  return configured === undefined ? fallback : configured.toLowerCase() === "true";
}

function stripeObjectId(object) {
  return typeof object === "string" ? object : object?.id;
}

function safeOrigin(raw) {
  if (!raw) return undefined;
  try {
    return new URL(raw.startsWith("http://") || raw.startsWith("https://") ? raw : `https://${raw}`).origin;
  } catch {
    return undefined;
  }
}

function webhookEndpointMatches(raw, expectedOrigin, allowAutomationBypass) {
  if (!raw || !expectedOrigin) return false;
  try {
    const endpoint = new URL(raw);
    if (endpoint.origin !== expectedOrigin || endpoint.pathname !== "/api/stripe/webhook" || endpoint.hash) return false;
    const query = [...endpoint.searchParams.entries()];
    if (query.length === 0) return true;
    return allowAutomationBypass
      && query.length === 1
      && query[0][0] === "x-vercel-protection-bypass"
      && Boolean(query[0][1]);
  } catch {
    return false;
  }
}

function positiveCadAmount(name) {
  const amount = Number(value(name));
  return Number.isFinite(amount) && amount > 0 ? amount : undefined;
}

function validEmail(raw) {
  return Boolean(raw && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw));
}

function configurationChecks() {
  const environment = value("VERCEL_ENV") ?? "development";
  const secret = value("STRIPE_SECRET_KEY");
  const expectedLive = environment === "production";
  const keyMatches = secret
    ? expectedLive
      ? secret.startsWith("sk_live_") || secret.startsWith("rk_live_")
      : secret.startsWith("sk_test_") || secret.startsWith("rk_test_")
    : false;
  const hostedUrl = (name, host) => {
    const url = value(name);
    if (!url?.startsWith(`https://${host}/`)) return undefined;
    const isTest = url.startsWith(`https://${host}/test_`);
    return (expectedLive ? isTest : !isTest) ? undefined : url;
  };
  const monthlyLink = hostedUrl("STRIPE_PAYMENT_LINK_MONTHLY", "buy.stripe.com");
  const annualLink = hostedUrl("STRIPE_PAYMENT_LINK_ANNUAL", "buy.stripe.com");
  const portalLink = hostedUrl("STRIPE_PORTAL_LOGIN_URL", "billing.stripe.com");
  const linksMode = !secret && Boolean(monthlyLink && annualLink && monthlyLink !== annualLink);
  if (linksMode) {
    record("Configuration", true, `Hosted Payment Links are configured for ${environment} (no API key mode)`);
    record("Configuration", Boolean(portalLink), `Hosted customer portal login link is configured for ${environment}`);
  } else {
    record("Configuration", Boolean(secret), "Stripe secret key is configured");
    record("Configuration", keyMatches, `Stripe key mode matches ${environment}`);
  }
  record("Configuration", value("STRIPE_WEBHOOK_SECRET")?.startsWith("whsec_") === true, "Webhook signing secret is configured");
  record("Configuration", value("STRIPE_PRICE_MONTHLY")?.startsWith("price_") === true, "Monthly Stripe price is configured");
  record("Configuration", value("STRIPE_PRICE_ANNUAL")?.startsWith("price_") === true, "Annual Stripe price is configured");
  record("Configuration", value("STRIPE_PRICE_MONTHLY") !== value("STRIPE_PRICE_ANNUAL"), "Monthly and annual prices are distinct");
  record("Configuration", Boolean(value("SUPABASE_SERVICE_ROLE_KEY")), "Supabase service-role key is configured");
  record("Configuration", Boolean(safeOrigin(value("NEXT_PUBLIC_SUPABASE_URL"))), "Supabase URL is valid");
  record("Configuration", Boolean(safeOrigin(value("NEXT_PUBLIC_SITE_URL"))), "Canonical site URL is configured");
  record("Configuration", Boolean(positiveCadAmount("NEXT_PUBLIC_BILLING_MONTHLY_CAD")), "Public monthly CAD price is configured");
  record("Configuration", Boolean(positiveCadAmount("NEXT_PUBLIC_BILLING_ANNUAL_CAD")), "Public annual CAD price is configured");
  record("Configuration", validEmail(value("NEXT_PUBLIC_SUPPORT_EMAIL")), "Public support email is configured");
  record("Configuration", booleanValue("BILLING_TERMS_READY"), "Commercial and legal terms are approved");
  record("Configuration", !booleanValue("BILLING_REQUIRED"), "Application billing enforcement remains off during preflight");
  const graceDays = Number(value("BILLING_GRACE_DAYS") ?? 3);
  record("Configuration", Number.isInteger(graceDays) && graceDays >= 0 && graceDays <= 30, "Failed-payment grace period is between 0 and 30 days");
  const trialDays = Number(value("STRIPE_TRIAL_DAYS") ?? 0);
  record("Configuration", Number.isInteger(trialDays) && trialDays >= 0 && trialDays <= 365, "Trial duration is between 0 and 365 days");
  const automaticTax = value("STRIPE_AUTOMATIC_TAX");
  record("Configuration", automaticTax === undefined || ["true", "false"].includes(automaticTax.toLowerCase()), "Stripe automatic-tax flag is valid");
}

async function verifySupabase() {
  const origin = safeOrigin(value("NEXT_PUBLIC_SUPABASE_URL"));
  const serviceRole = value("SUPABASE_SERVICE_ROLE_KEY");
  if (!origin || !serviceRole) return;
  const headers = { apikey: serviceRole, Authorization: `Bearer ${serviceRole}` };
  try {
    const [settingsResponse, schemaResponse] = await Promise.all([
      fetch(`${origin}/rest/v1/billing_settings?select=billing_required,grace_days&id=eq.true`, { headers }),
      fetch(`${origin}/rest/v1/`, { headers }),
    ]);
    record("Supabase", settingsResponse.ok, "Billing settings are readable with the server-only role");
    if (settingsResponse.ok) {
      const settings = await settingsResponse.json();
      const row = settings[0];
      record("Supabase", row?.billing_required === false, "Database billing enforcement remains off during preflight");
      record("Supabase", row?.grace_days === Number(value("BILLING_GRACE_DAYS") ?? 3), "Database and application grace periods match");
    }
    record("Supabase", schemaResponse.ok, "PostgREST schema is readable with the server-only role");
    if (schemaResponse.ok) {
      const schema = await schemaResponse.json();
      const paths = schema.paths ?? {};
      for (const rpc of ["sync_billing_subscription", "claim_stripe_webhook_event"]) {
        record("Supabase", Boolean(paths[`/rpc/${rpc}`]), `${rpc} is available to its intended server role`);
      }
      for (const table of ["billing_customers", "billing_subscriptions", "billing_access_grants", "stripe_webhook_events"]) {
        record("Supabase", Boolean(paths[`/${table}`]), `${table} is present in the API schema`);
      }
    }
  } catch {
    record("Supabase", false, "Linked billing database could not be reached");
  }
}

async function verifyStripe() {
  const secret = value("STRIPE_SECRET_KEY");
  const monthlyId = value("STRIPE_PRICE_MONTHLY");
  const annualId = value("STRIPE_PRICE_ANNUAL");
  if (!secret || !monthlyId || !annualId) return;
  const stripe = new Stripe(secret, { appInfo: { name: "Montreal QBank readiness preflight" } });
  try {
    const taxEnabled = booleanValue("STRIPE_AUTOMATIC_TAX");
    const [monthly, annual, portalConfigurations, webhookEndpoints, taxRegistrations] = await Promise.all([
      stripe.prices.retrieve(monthlyId),
      stripe.prices.retrieve(annualId),
      stripe.billingPortal.configurations.list({ active: true, limit: 100 }),
      stripe.webhookEndpoints.list({ limit: 100 }),
      taxEnabled ? stripe.tax.registrations.list({ status: "active", limit: 100 }) : Promise.resolve(null),
    ]);
    record("Stripe", monthly.active && monthly.currency === "cad" && monthly.type === "recurring" && monthly.recurring?.interval === "month", "Monthly price is an active recurring CAD monthly price");
    record("Stripe", annual.active && annual.currency === "cad" && annual.type === "recurring" && annual.recurring?.interval === "year", "Annual price is an active recurring CAD annual price");
    record("Stripe", monthly.unit_amount === Math.round((positiveCadAmount("NEXT_PUBLIC_BILLING_MONTHLY_CAD") ?? -1) * 100), "Displayed monthly price matches Stripe");
    record("Stripe", annual.unit_amount === Math.round((positiveCadAmount("NEXT_PUBLIC_BILLING_ANNUAL_CAD") ?? -1) * 100), "Displayed annual price matches Stripe");
    const productId = stripeObjectId(monthly.product);
    record("Stripe", Boolean(productId && productId === stripeObjectId(annual.product)), "Monthly and annual prices belong to one product");
    let product;
    if (productId) {
      product = await stripe.products.retrieve(productId);
      record("Stripe", !product.deleted && product.active && product.name === "Montreal QBank", "The shared active product is named Montreal QBank");
      record("Stripe", !product.deleted && product.statement_descriptor === "MONTREAL QBANK", "The product uses the approved subscription statement descriptor");
    }

    if (taxEnabled) {
      record("Stripe", Boolean(product && !product.deleted && product.tax_code), "Stripe Tax product tax code is configured");
      record("Stripe", ["inclusive", "exclusive"].includes(monthly.tax_behavior ?? "") && ["inclusive", "exclusive"].includes(annual.tax_behavior ?? ""), "Monthly and annual tax behavior is explicit");
      record("Stripe", taxRegistrations?.data.some((registration) => registration.country === "CA") === true, "An active Canadian Stripe Tax registration exists");
    }

    const portal = portalConfigurations.data.find((configuration) => (
      configuration.features.payment_method_update.enabled
      && configuration.features.invoice_history.enabled
      && configuration.features.subscription_cancel.enabled
      && configuration.features.subscription_cancel.mode === "at_period_end"
    ));
    record("Stripe", Boolean(portal), "An active portal supports payment updates, invoices, and cancellation at period end");

    const webhook = webhookEndpoints.data.find((endpoint) => {
      if (endpoint.status !== "enabled") return false;
      const events = new Set(endpoint.enabled_events);
      return events.has("*") || [...requiredWebhookEvents].every((event) => events.has(event));
    });
    record("Stripe", Boolean(webhook), "An enabled webhook endpoint subscribes to every required billing event");
    const expectedWebhookOrigin = safeOrigin(value("NEXT_PUBLIC_SITE_URL"));
    const allowAutomationBypass = (value("VERCEL_ENV") ?? "development") !== "production";
    record(
      "Stripe",
      Boolean(webhook && webhookEndpointMatches(webhook.url, expectedWebhookOrigin, allowAutomationBypass)),
      "Webhook endpoint URL matches the configured site",
    );
  } catch {
    record("Stripe", false, "Stripe catalog, portal, or webhook configuration could not be verified");
  }
}

configurationChecks();
await Promise.all([verifySupabase(), verifyStripe()]);

for (const check of checks) {
  console.log(`${check.passed ? "PASS" : "FAIL"} [${check.scope}] ${check.detail}`);
}

const failed = checks.filter((check) => !check.passed).length;
console.log(`\n${checks.length - failed}/${checks.length} readiness checks passed.`);
if (failed && !allowIncomplete) process.exitCode = 1;
