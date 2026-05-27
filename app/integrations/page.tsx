"use client";
// app/integrations/page.tsx
// Integrations hub — connect Shopify and other data sources.

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/AuthContext";
import { getUserFolders, BusinessFolder } from "@/lib/db";
import Nav from "@/components/Nav";

type Integration = {
  id: string; name: string; description: string;
  icon: string; color: string; bg: string;
  status: "available" | "coming"; category: string;
};

const INTEGRATIONS: Integration[] = [
  {
    id: "shopify", name: "Shopify", icon: "🛒",
    color: "#5a8a00", bg: "#f0f7e6",
    category: "E-Commerce", status: "available",
    description: "Pull orders, revenue, products, customers, and inventory automatically from your Shopify store.",
  },
  {
    id: "square", name: "Square POS", icon: "⬛",
    color: "#1a1a1a", bg: "#f5f5f5",
    category: "Point of Sale", status: "coming",
    description: "Connect Square to sync daily sales, top items, labor, and payment reports.",
  },
  {
    id: "quickbooks", name: "QuickBooks", icon: "🟦",
    color: "#0077c5", bg: "#e6f2fb",
    category: "Accounting", status: "coming",
    description: "Pull P&L statements, invoices, expenses, and financial reports automatically.",
  },
  {
    id: "stripe", name: "Stripe", icon: "💜",
    color: "#635bff", bg: "#f0effe",
    category: "Payments", status: "coming",
    description: "Revenue, MRR, churn, failed payments, and subscription analytics.",
  },
  {
    id: "toast", name: "Toast POS", icon: "🔴",
    color: "#cc4400", bg: "#fef0eb",
    category: "Restaurant", status: "coming",
    description: "Daily sales, covers, labor cost, menu performance, and void reports.",
  },
  {
    id: "woo", name: "WooCommerce", icon: "🟣",
    color: "#7f54b3", bg: "#f4f0f9",
    category: "E-Commerce", status: "coming",
    description: "Orders, products, revenue, and customer data from your WooCommerce store.",
  },
  {
    id: "xero", name: "Xero", icon: "🔵",
    color: "#0e78f8", bg: "#e6f1fe",
    category: "Accounting", status: "coming",
    description: "Financial reports, bank reconciliation, invoices, and cash flow.",
  },
  {
    id: "amazon", name: "Amazon Seller", icon: "🟠",
    color: "#e47911", bg: "#fdf3e6",
    category: "E-Commerce", status: "coming",
    description: "Sales, FBA metrics, advertising performance, and product analytics.",
  },
];

const CATEGORIES = ["All", ...Array.from(new Set(INTEGRATIONS.map(i => i.category)))];

// ── Shopify connect form ───────────────────────────────────
function ShopifyConnect({
  userId, folders, onConnected,
}: {
  userId: string;
  folders: BusinessFolder[];
  onConnected: (shopName: string) => void;
}) {
  const [shopInput,      setShopInput]      = useState("");
  const [selectedFolder, setSelectedFolder] = useState(folders[0]?.id || "");
  const [connecting,     setConnecting]     = useState(false);
  const [syncing,        setSyncing]        = useState(false);
  const [error,          setError]          = useState("");
  const [step,           setStep]           = useState<"input"|"confirm">("input");

  async function handleConnect() {
    if (!shopInput.trim()) return;
    setConnecting(true);
    setError("");
    try {
      const res  = await fetch("/api/shopify/auth", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopDomain: shopInput.trim(), userId }),
      });
      const data = await res.json();
      if (!data.authURL) throw new Error(data.error || "Could not build auth URL");
      window.location.href = data.authURL;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Connection failed");
      setConnecting(false);
    }
  }

  return (
    <div className="mt-4 space-y-3">
      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1.5">
          Your Shopify store name
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              value={shopInput}
              onChange={e => setShopInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleConnect()}
              placeholder="mybrand"
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 pr-32"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">
              .myshopify.com
            </span>
          </div>
        </div>
      </div>

      {error && (
        <div className="text-red-600 text-xs bg-red-50 border border-red-200 px-3 py-2 rounded-lg">
          {error}
        </div>
      )}

      <p className="text-xs text-gray-400 leading-relaxed">
        You&apos;ll be taken to Shopify to approve the connection. DashWise only <strong>reads</strong> your data — never writes or changes anything.
      </p>

      <button
        onClick={handleConnect}
        disabled={!shopInput.trim() || connecting}
        className="w-full py-2.5 rounded-xl font-bold text-sm text-white disabled:opacity-40 transition-all flex items-center justify-center gap-2"
        style={{ background: "#5a8a00" }}
      >
        {connecting ? (
          <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Connecting to Shopify...</>
        ) : (
          "Connect with Shopify →"
        )}
      </button>
    </div>
  );
}

// ── Shopify connected state ────────────────────────────────
function ShopifyConnected({
  userId, shopInfo, folders,
}: {
  userId: string;
  shopInfo: { shopName: string; shopDomain: string };
  folders: BusinessFolder[];
}) {
  const [selectedFolder, setSelectedFolder] = useState(folders[0]?.id || "");
  const [syncing,        setSyncing]        = useState(false);
  const [syncResult,     setSyncResult]     = useState<{ orders: number; revenue: number } | null>(null);
  const [error,          setError]          = useState("");

  async function handleSync() {
    if (!selectedFolder) return;
    setSyncing(true);
    setSyncResult(null);
    setError("");
    try {
      const res  = await fetch("/api/shopify/sync", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, folderId: selectedFolder, daysBack: 90 }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Sync failed");
      setSyncResult({ orders: data.ordersCount, revenue: data.revenue });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="mt-4 space-y-3">
      {/* Store info */}
      <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-xl">
        <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center text-lg">🛒</div>
        <div>
          <div className="font-semibold text-sm text-green-900">{shopInfo.shopName}</div>
          <div className="text-xs text-green-600">{shopInfo.shopDomain}</div>
        </div>
        <span className="ml-auto text-xs bg-green-600 text-white px-2 py-0.5 rounded-full font-medium">✓ Connected</span>
      </div>

      {/* Sync result */}
      {syncResult && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-800">
          ✅ Synced <strong>{syncResult.orders} orders</strong> · <strong>${syncResult.revenue.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong> revenue (last 90 days)
        </div>
      )}

      {error && (
        <div className="text-red-600 text-xs bg-red-50 border border-red-200 px-3 py-2 rounded-lg">{error}</div>
      )}

      {/* Folder selector */}
      {folders.length > 0 ? (
        <>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Sync data into folder</label>
            <select
              value={selectedFolder}
              onChange={e => setSelectedFolder(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {folders.map(f => <option key={f.id} value={f.id}>{f.bizName}</option>)}
            </select>
          </div>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="w-full py-2.5 rounded-xl font-bold text-sm text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {syncing
              ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Syncing last 90 days...</>
              : "🔄 Sync Now (last 90 days)"}
          </button>
        </>
      ) : (
        <div className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-xl p-3">
          <Link href="/files" className="text-blue-600 hover:underline font-medium">Create a folder first</Link> — then come back to sync your Shopify data into it.
        </div>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────
function IntegrationsContent() {
  const { user } = useAuth();
  const searchParams = useSearchParams();

  const [shopifyConnected, setShopifyConnected] = useState(false);
  const [shopifyInfo,      setShopifyInfo]      = useState<{ shopName: string; shopDomain: string } | null>(null);
  const [folders,          setFolders]          = useState<BusinessFolder[]>([]);
  const [activeCategory,   setActiveCategory]   = useState("All");
  const [expandedId,       setExpandedId]       = useState<string | null>(null);
  const [banner,           setBanner]           = useState<{ type: "success"|"error"; msg: string } | null>(null);

  // Handle OAuth callback params
  useEffect(() => {
    const connected = searchParams.get("connected");
    const shop      = searchParams.get("shop");
    const err       = searchParams.get("error");

    if (connected === "shopify" && shop) {
      setBanner({ type: "success", msg: `✅ Successfully connected to ${shop}!` });
      setShopifyConnected(true);
      setExpandedId("shopify");
    }
    if (err) {
      const msgs: Record<string, string> = {
        shopify_auth_failed: "Shopify connection failed. Please try again.",
        missing_params:      "Invalid callback. Please try connecting again.",
        invalid_state:       "Security check failed. Please try again.",
      };
      setBanner({ type: "error", msg: msgs[err] || "Connection failed — please try again." });
    }
  }, [searchParams]);

  // Load folders + check Shopify connection
  useEffect(() => {
    if (!user) return;
    getUserFolders(user.uid).then(setFolders);

    // Check for saved Shopify connection
    import("@/lib/integrations/shopify").then(({ getShopifyConnection }) =>
      getShopifyConnection(user.uid).then(conn => {
        if (conn) {
          setShopifyConnected(true);
          setShopifyInfo({ shopName: conn.shopName, shopDomain: conn.shopDomain });
        }
      })
    );
  }, [user]);

  const filtered = INTEGRATIONS.filter(i =>
    activeCategory === "All" || i.category === activeCategory
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <Nav />

      <main className="max-w-5xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Integrations</h1>
          <p className="text-gray-500 text-sm mt-1">
            Connect your business tools. DashWise pulls your data automatically — no manual exports.
          </p>
        </div>

        {/* Banner */}
        {banner && (
          <div className={`mb-6 px-4 py-3 rounded-xl text-sm flex items-center justify-between border ${
            banner.type === "success"
              ? "bg-green-50 border-green-200 text-green-800"
              : "bg-red-50 border-red-200 text-red-700"
          }`}>
            {banner.msg}
            <button onClick={() => setBanner(null)} className="ml-3 opacity-60 hover:opacity-100 text-lg leading-none">×</button>
          </div>
        )}

        {/* Category filter */}
        <div className="flex gap-2 flex-wrap mb-6">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                activeCategory === cat
                  ? "bg-gray-900 text-white border-gray-900"
                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Integration cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          {filtered.map(integration => {
            const isExpanded  = expandedId === integration.id;
            const isShopify   = integration.id === "shopify";
            const isConnected = isShopify && shopifyConnected;

            return (
              <div
                key={integration.id}
                className={`bg-white rounded-2xl border overflow-hidden shadow-sm transition-all ${
                  isConnected ? "border-green-300" : "border-gray-100"
                }`}
              >
                {/* Card header */}
                <div className="p-5">
                  <div className="flex items-start gap-4">
                    {/* Icon */}
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0"
                      style={{ background: integration.bg }}
                    >
                      {integration.icon}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-gray-900">{integration.name}</span>
                        <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                          {integration.category}
                        </span>
                        {isConnected && (
                          <span className="text-xs bg-green-100 text-green-700 border border-green-200 px-2 py-0.5 rounded-full font-medium">
                            ✓ Connected
                          </span>
                        )}
                        {integration.status === "coming" && (
                          <span className="text-xs bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full">
                            Coming soon
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 mt-1 leading-relaxed">{integration.description}</p>
                    </div>
                  </div>

                  {/* Action button */}
                  <div className="mt-4">
                    {integration.status === "coming" ? (
                      <div className="w-full py-2 rounded-xl text-center text-sm text-gray-400 bg-gray-50 border border-gray-200">
                        Coming soon
                      </div>
                    ) : isShopify ? (
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : integration.id)}
                        className={`w-full py-2.5 rounded-xl font-bold text-sm transition-all border ${
                          isExpanded
                            ? "border-gray-200 text-gray-600 hover:bg-gray-50"
                            : isConnected
                            ? "bg-blue-600 text-white hover:bg-blue-700"
                            : "text-white"
                        }`}
                        style={!isExpanded && !isConnected ? { background: integration.color } : {}}
                      >
                        {isExpanded ? "↑ Close" : isConnected ? "Manage connection" : `Connect ${integration.name}`}
                      </button>
                    ) : null}
                  </div>
                </div>

                {/* Expanded panel */}
                {isExpanded && isShopify && user && (
                  <div className="border-t border-gray-100 px-5 pb-5">
                    {isConnected && shopifyInfo ? (
                      <ShopifyConnected
                        userId={user.uid}
                        shopInfo={shopifyInfo}
                        folders={folders}
                      />
                    ) : (
                      <ShopifyConnect
                        userId={user.uid}
                        folders={folders}
                        onConnected={(shopName) => {
                          setShopifyConnected(true);
                          setBanner({ type: "success", msg: `✅ Connected to ${shopName}!` });
                        }}
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Manual upload CTA */}
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5 flex items-center gap-4">
          <div className="text-3xl flex-shrink-0">📁</div>
          <div className="flex-1">
            <div className="font-bold text-gray-900 mb-0.5">Don&apos;t see your tool?</div>
            <div className="text-sm text-gray-500">
              Export any CSV, Excel, or PDF from any system and upload it directly to your folders. DashWise reads any format.
            </div>
          </div>
          <Link
            href="/files"
            className="bg-blue-600 text-white font-bold text-sm px-4 py-2.5 rounded-xl hover:bg-blue-700 flex-shrink-0 transition-colors"
          >
            Upload Files →
          </Link>
        </div>
      </main>
    </div>
  );
}

export default function IntegrationsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-400 text-sm">Loading integrations...</div>
      </div>
    }>
      <IntegrationsContent />
    </Suspense>
  );
}
