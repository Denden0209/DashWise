// lib/integrations/shopify.ts
import { doc, setDoc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

export type ShopifyConnection = {
  shopDomain: string; accessToken: string; shopName: string;
  shopEmail: string; currency: string; connectedAt: unknown;
  lastSyncAt?: unknown; scopes: string[];
};

export type ShopifyOrder = {
  id: number; name: string; created_at: string;
  total_price: string; financial_status: string;
  fulfillment_status: string | null;
  line_items: { id: number; title: string; quantity: number; price: string; sku: string }[];
  customer?: { email: string };
  refunds: { id: number }[];
};

export type ShopifyProduct = {
  id: number; title: string; vendor: string; status: string;
  variants: { id: number; price: string; inventory_quantity: number; sku: string }[];
};

export type ShopifyAnalytics = {
  orders: ShopifyOrder[]; products: ShopifyProduct[];
  totalRevenue: number; totalOrders: number; avgOrderValue: number;
  totalCustomers: number;
  topProducts: { title: string; revenue: number; units: number }[];
  revenueByDay: { date: string; revenue: number; orders: number }[];
  refundRate: number; fulfillmentRate: number; period: string;
};

async function shopifyFetch(shopDomain: string, accessToken: string, endpoint: string, params: Record<string,string> = {}): Promise<unknown> {
  const url = new URL(`https://${shopDomain}/admin/api/2024-01/${endpoint}`);
  Object.entries(params).forEach(([k,v]) => url.searchParams.set(k,v));
  const res = await fetch(url.toString(), {
    headers: { "X-Shopify-Access-Token": accessToken, "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`Shopify API ${res.status}`);
  return await res.json();
}

export async function fetchOrders(shopDomain: string, accessToken: string, daysBack = 90): Promise<ShopifyOrder[]> {
  const since = new Date();
  since.setDate(since.getDate() - daysBack);
  const data = await shopifyFetch(shopDomain, accessToken, "orders.json", {
    status: "any", created_at_min: since.toISOString(), limit: "250",
    fields: "id,name,created_at,total_price,financial_status,fulfillment_status,line_items,customer,refunds",
  }) as { orders: ShopifyOrder[] };
  return data.orders || [];
}

export async function fetchProducts(shopDomain: string, accessToken: string): Promise<ShopifyProduct[]> {
  const data = await shopifyFetch(shopDomain, accessToken, "products.json", {
    limit: "250", fields: "id,title,vendor,status,variants",
  }) as { products: ShopifyProduct[] };
  return data.products || [];
}

export function buildShopifyAnalytics(orders: ShopifyOrder[], products: ShopifyProduct[], daysBack: number): ShopifyAnalytics {
  const paid         = orders.filter(o => o.financial_status === "paid" || o.financial_status === "partially_paid");
  const totalRevenue = paid.reduce((s, o) => s + parseFloat(o.total_price), 0);
  const totalOrders  = paid.length;
  const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  const emails       = new Set(paid.map(o => o.customer?.email).filter(Boolean));

  const productRev: Record<string, { revenue: number; units: number }> = {};
  paid.forEach(o => o.line_items?.forEach(item => {
    if (!productRev[item.title]) productRev[item.title] = { revenue: 0, units: 0 };
    productRev[item.title].revenue += parseFloat(item.price) * item.quantity;
    productRev[item.title].units   += item.quantity;
  }));

  const topProducts = Object.entries(productRev)
    .map(([title, d]) => ({ title, ...d }))
    .sort((a, b) => b.revenue - a.revenue).slice(0, 10);

  const byDay: Record<string, { revenue: number; orders: number }> = {};
  paid.forEach(o => {
    const day = o.created_at.split("T")[0];
    if (!byDay[day]) byDay[day] = { revenue: 0, orders: 0 };
    byDay[day].revenue += parseFloat(o.total_price);
    byDay[day].orders  += 1;
  });
  const revenueByDay = Object.entries(byDay).map(([date, d]) => ({ date, ...d })).sort((a,b) => a.date.localeCompare(b.date));

  const refundRate      = orders.length > 0 ? (orders.filter(o => o.financial_status === "refunded").length / orders.length) * 100 : 0;
  const fulfillmentRate = paid.length > 0 ? (paid.filter(o => o.fulfillment_status === "fulfilled").length / paid.length) * 100 : 0;

  return { orders, products, totalRevenue, totalOrders, avgOrderValue, totalCustomers: emails.size, topProducts, revenueByDay, refundRate, fulfillmentRate, period: `Last ${daysBack} days` };
}

export function analyticsToText(analytics: ShopifyAnalytics, shopName: string): string {
  const fmt = (n: number) => `$${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
  let t = `SHOPIFY STORE: ${shopName}\nPeriod: ${analytics.period}\n\n`;
  t += `═══ REVENUE SUMMARY ═══\nTotal Revenue: ${fmt(analytics.totalRevenue)}\nTotal Orders: ${analytics.totalOrders}\nAvg Order Value: ${fmt(analytics.avgOrderValue)}\nUnique Customers: ${analytics.totalCustomers}\nRefund Rate: ${analytics.refundRate.toFixed(1)}%\nFulfillment Rate: ${analytics.fulfillmentRate.toFixed(1)}%\n\n`;
  t += `═══ TOP PRODUCTS ═══\n`;
  analytics.topProducts.forEach((p,i) => { t += `${i+1}. ${p.title}: ${fmt(p.revenue)} (${p.units} units)\n`; });
  t += `\n═══ DAILY REVENUE (last 30 days) ═══\n`;
  analytics.revenueByDay.slice(-30).forEach(d => { t += `${d.date}: ${fmt(d.revenue)} (${d.orders} orders)\n`; });
  return t;
}

export async function saveShopifyConnection(uid: string, connection: ShopifyConnection): Promise<void> {
  await setDoc(doc(db, "users", uid, "integrations", "shopify"), connection, { merge: true });
}

export async function getShopifyConnection(uid: string): Promise<ShopifyConnection | null> {
  const snap = await getDoc(doc(db, "users", uid, "integrations", "shopify"));
  return snap.exists() ? (snap.data() as ShopifyConnection) : null;
}
