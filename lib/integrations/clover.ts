// lib/integrations/clover.ts
import { doc, setDoc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

export type CloverConnection = {
  merchantId:   string;
  accessToken:  string;
  merchantName: string;
  currency:     string;
  connectedAt:  unknown;
  lastSyncAt?:  unknown;
  environment:  "production" | "sandbox";
};

export type CloverOrder = {
  id:          string;
  createdTime: number;
  total:       number;
  state:       string;
  lineItems?:  { elements: { id:string; name:string; price:number; quantity?:number }[] };
};

export type CloverAnalytics = {
  orders:         CloverOrder[];
  totalRevenue:   number;
  totalOrders:    number;
  avgOrderValue:  number;
  refundCount:    number;
  refundRate:     number;
  topItems:       { name:string; revenue:number; count:number }[];
  revenueByDay:   { date:string; revenue:number; orders:number }[];
  revenueByHour:  { hour:string; revenue:number; orders:number }[];
  period:         string;
};

const BASE = {
  production: "https://api.clover.com",
  sandbox:    "https://sandbox.dev.clover.com",
};

export function buildCloverAuthURL(state: string, env: "production"|"sandbox" = "production"): string {
  const params = new URLSearchParams({
    client_id:     process.env.CLOVER_APP_ID!,
    redirect_uri:  `${process.env.NEXT_PUBLIC_APP_URL}/api/clover/callback`,
    state,
    response_type: "code",
  });
  return `${BASE[env]}/oauth/v2/authorize?${params.toString()}`;
}

export async function exchangeCloverCode(code: string, env: "production"|"sandbox" = "production") {
  const res = await fetch(`${BASE[env]}/oauth/v2/token`, {
    method:"POST", headers:{"Content-Type":"application/json"},
    body: JSON.stringify({
      client_id:    process.env.CLOVER_APP_ID,
      client_secret:process.env.CLOVER_APP_SECRET,
      code, grant_type:"authorization_code",
      redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/clover/callback`,
    }),
  });
  if (!res.ok) throw new Error(`Clover token exchange failed: ${res.status}`);
  const data = await res.json();
  return { accessToken: data.access_token, merchantId: data.merchant_id };
}

export async function getCloverMerchant(merchantId: string, accessToken: string, env: "production"|"sandbox" = "production") {
  const res = await fetch(`${BASE[env]}/v3/merchants/${merchantId}`, {
    headers:{ "Authorization":`Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error("Failed to fetch Clover merchant");
  return await res.json();
}

export async function fetchCloverOrders(merchantId: string, accessToken: string, daysBack = 90, env: "production"|"sandbox" = "production"): Promise<CloverOrder[]> {
  const since = Date.now() - daysBack * 24 * 60 * 60 * 1000;
  const url   = new URL(`${BASE[env]}/v3/merchants/${merchantId}/orders`);
  url.searchParams.set("filter",  `createdTime>=${since}`);
  url.searchParams.set("expand",  "lineItems");
  url.searchParams.set("limit",   "500");
  url.searchParams.set("orderBy", "createdTime DESC");
  const res  = await fetch(url.toString(), { headers:{ "Authorization":`Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Clover API ${res.status}`);
  const data = await res.json();
  return data.elements || [];
}

export async function fetchCloverItems(merchantId: string, accessToken: string, env: "production"|"sandbox" = "production") {
  const url = new URL(`${BASE[env]}/v3/merchants/${merchantId}/items`);
  url.searchParams.set("limit","250");
  const res  = await fetch(url.toString(), { headers:{ "Authorization":`Bearer ${accessToken}` } });
  if (!res.ok) return [];
  const data = await res.json();
  return data.elements || [];
}

export function buildCloverAnalytics(orders: CloverOrder[], daysBack: number): CloverAnalytics {
  const paid         = orders.filter(o => o.state === "paid" || o.state === "locked");
  const totalRevenue = paid.reduce((s, o) => s + (o.total / 100), 0);
  const totalOrders  = paid.length;
  const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  const refundCount  = orders.filter(o => o.state === "refunded").length;
  const refundRate   = orders.length > 0 ? (refundCount / orders.length) * 100 : 0;

  const itemRev: Record<string,{revenue:number;count:number}> = {};
  paid.forEach(o => o.lineItems?.elements?.forEach(item => {
    if (!itemRev[item.name]) itemRev[item.name] = { revenue:0, count:0 };
    itemRev[item.name].revenue += (item.price / 100) * (item.quantity || 1);
    itemRev[item.name].count   += (item.quantity || 1);
  }));
  const topItems = Object.entries(itemRev).map(([name,d])=>({name,...d})).sort((a,b)=>b.revenue-a.revenue).slice(0,10);

  const byDay: Record<string,{revenue:number;orders:number}> = {};
  paid.forEach(o => {
    const date = new Date(o.createdTime).toISOString().split("T")[0];
    if (!byDay[date]) byDay[date] = { revenue:0, orders:0 };
    byDay[date].revenue += o.total / 100;
    byDay[date].orders  += 1;
  });
  const revenueByDay = Object.entries(byDay).map(([date,d])=>({date,...d})).sort((a,b)=>a.date.localeCompare(b.date));

  const byHour: Record<number,{revenue:number;orders:number}> = {};
  paid.forEach(o => {
    const h = new Date(o.createdTime).getHours();
    if (!byHour[h]) byHour[h] = { revenue:0, orders:0 };
    byHour[h].revenue += o.total / 100;
    byHour[h].orders  += 1;
  });
  const revenueByHour = Array.from({length:24},(_,h)=>({
    hour:`${h.toString().padStart(2,"0")}:00`,
    revenue: byHour[h]?.revenue||0,
    orders:  byHour[h]?.orders||0,
  }));

  return { orders, totalRevenue, totalOrders, avgOrderValue, refundCount, refundRate, topItems, revenueByDay, revenueByHour, period:`Last ${daysBack} days` };
}

export function cloverAnalyticsToText(analytics: CloverAnalytics, merchantName: string): string {
  const fmt = (n:number) => `$${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,",")}`;
  let t = `CLOVER POS: ${merchantName}\nPeriod: ${analytics.period}\n\n`;
  t += `═══ REVENUE SUMMARY ═══\nTotal Revenue: ${fmt(analytics.totalRevenue)}\nTotal Orders: ${analytics.totalOrders}\nAvg Order Value: ${fmt(analytics.avgOrderValue)}\nRefund Rate: ${analytics.refundRate.toFixed(1)}%\n\n`;
  t += `═══ TOP ITEMS ═══\n`;
  analytics.topItems.forEach((item,i) => { t += `${i+1}. ${item.name}: ${fmt(item.revenue)} (${item.count} sold)\n`; });
  t += `\n═══ REVENUE BY DAY ═══\n`;
  analytics.revenueByDay.slice(-30).forEach(d => { t += `${d.date}: ${fmt(d.revenue)} (${d.orders} orders)\n`; });
  t += `\n═══ PEAK HOURS ═══\n`;
  analytics.revenueByHour.filter(h=>h.orders>0).forEach(h => { t += `${h.hour}: ${fmt(h.revenue)} (${h.orders} orders)\n`; });
  return t;
}

export async function saveCloverConnection(uid: string, connection: CloverConnection): Promise<void> {
  await setDoc(doc(db, "users", uid, "integrations", "clover"), connection, { merge:true });
}

export async function getCloverConnection(uid: string): Promise<CloverConnection | null> {
  const snap = await getDoc(doc(db, "users", uid, "integrations", "clover"));
  return snap.exists() ? (snap.data() as CloverConnection) : null;
}
