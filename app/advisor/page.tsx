"use client";
// app/advisor/page.tsx
// Reads ALL folders + ALL files across the whole account.
// Builds a full business picture for Claude before every conversation.

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/AuthContext";
import {
  getRecentChats, saveChatMessage,
  getAllBusinessData, ChatMessage,
} from "@/lib/db";
import Nav from "@/components/Nav";

const SUGGESTED = [
  "What's the overall health of my business?",
  "Compare performance across all my folders",
  "Where am I losing the most money?",
  "What should I focus on this week?",
  "What trends do you see across all my data?",
  "Which part of my business is growing fastest?",
  "What's my biggest risk right now?",
  "How do I improve my overall margins?",
];

function AdvisorChat() {
  const { user, profile } = useAuth();
  const searchParams = useSearchParams();
  const chatEndRef   = useRef<HTMLDivElement>(null);
  const inputRef     = useRef<HTMLTextAreaElement>(null);

  const [messages,     setMessages]     = useState<ChatMessage[]>([]);
  const [input,        setInput]        = useState("");
  const [thinking,     setThinking]     = useState(false);
  const [loaded,       setLoaded]       = useState(false);
  const [businessData, setBusinessData] = useState<{
    folderCount:     number;
    fileCount:       number;
    folderSummaries: {
      folderName:    string;
      fileNames:     string[];
      fileTypes:     string[];
      parsedContent: string;
      lastAnalysis:  string;
    }[];
  } | null>(null);

  // Load everything client-side — chat history + all business data
  useEffect(() => {
    if (!user || loaded) return;

    Promise.all([
      getRecentChats(user.uid, 20),
      getAllBusinessData(user.uid),
    ]).then(([chats, bizData]) => {
      setBusinessData(bizData);

      if (chats.length > 0) {
        setMessages(chats);
      } else {
        const hasFolders = bizData.folderCount > 0;
        const intro: ChatMessage = {
          role: "assistant",
          content: hasFolders
            ? `Hey ${profile?.name?.split(" ")[0] || "there"}! 👋\n\nI've loaded your full business picture — **${bizData.folderCount} folder${bizData.folderCount !== 1 ? "s" : ""}** with **${bizData.fileCount} file${bizData.fileCount !== 1 ? "s" : ""}** across:\n${bizData.folderSummaries.map(f => `• **${f.folderName}** — ${f.fileNames.join(", ")}`).join("\n")}\n\nI can see patterns and trends across all of your data. What would you like to know?`
            : `Hey ${profile?.name?.split(" ")[0] || "there"}! 👋 I'm your DashWise advisor.\n\nI don't see any uploaded files yet. Head to the **Files** page to create a folder and upload your business data — CSV exports, Excel sheets, PDFs — and I'll give you specific insights about your numbers.\n\nIn the meantime, what questions do you have?`,
          type: "intro",
        };
        setMessages([intro]);
      }
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, [user, profile, loaded]);

  // Pre-fill from dashboard or history links
  useEffect(() => {
    const q = searchParams.get("q");
    if (q && loaded && input === "") {
      setInput(q);
      inputRef.current?.focus();
    }
  }, [searchParams, loaded, input]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking]);

  async function sendMessage(text?: string) {
    const msg = (text || input).trim();
    if (!msg || thinking || !user) return;

    const userMsg: ChatMessage = { role: "user", content: msg };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setThinking(true);

    saveChatMessage(user.uid, userMsg).catch(console.error);

    try {
      const res = await fetch("/api/chat", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message:      msg,
          profile,
          businessData, // ALL folders and files
          chatHistory:  messages.slice(-20).map(m => ({
            role:    m.role,
            content: m.content,
          })),
        }),
      });

      const ct = res.headers.get("content-type") || "";
      if (!ct.includes("application/json")) throw new Error("Server error");

      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Chat failed");

      const assistantMsg: ChatMessage = { role: "assistant", content: data.reply };
      setMessages(prev => [...prev, assistantMsg]);
      saveChatMessage(user.uid, assistantMsg).catch(console.error);

    } catch (err: unknown) {
      const errMsg: ChatMessage = {
        role:    "assistant",
        content: `Something went wrong: ${err instanceof Error ? err.message : "Please try again."}`,
      };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setThinking(false);
    }
  }

  function renderMsg(content: string) {
    return content.split("\n").map((line, i) => {
      if (!line.trim()) return <div key={i} className="h-1.5"/>;
      if (line.match(/\*\*(.*?)\*\*/))
        return <p key={i} className="mb-1 leading-relaxed"
          dangerouslySetInnerHTML={{ __html: line.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>") }}/>;
      return <p key={i} className="mb-1 leading-relaxed">{line}</p>;
    });
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Nav />

      {/* Context bar — shows what the advisor has loaded */}
      <div className="bg-blue-50 border-b border-blue-100 py-2 px-6 flex-shrink-0">
        <div className="max-w-3xl mx-auto flex items-center gap-2 text-xs text-blue-700 flex-wrap">
          <span className="font-semibold">Advisor knows:</span>
          {profile?.bizName && (
            <span className="bg-blue-100 px-2 py-0.5 rounded-full">🏪 {profile.bizName}</span>
          )}
          {businessData && businessData.folderCount > 0 ? (
            <>
              <span className="bg-blue-100 px-2 py-0.5 rounded-full">
                📁 {businessData.folderCount} folder{businessData.folderCount !== 1 ? "s" : ""}
              </span>
              <span className="bg-blue-100 px-2 py-0.5 rounded-full">
                📄 {businessData.fileCount} file{businessData.fileCount !== 1 ? "s" : ""}
              </span>
              {businessData.folderSummaries.map(f => (
                <span key={f.folderName} className="bg-blue-100 px-2 py-0.5 rounded-full">
                  {f.folderName}
                </span>
              ))}
            </>
          ) : loaded ? (
            <span className="bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">
              ⚠️ No uploads yet —{" "}
              <Link href="/files" className="underline font-medium">upload files</Link>
            </span>
          ) : (
            <span className="text-blue-400">Loading your business data...</span>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto max-w-3xl mx-auto w-full px-6 py-6 space-y-4">
        {!loaded && (
          <div className="text-center py-10">
            <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"/>
            <div className="text-gray-400 text-sm">Loading all your business data...</div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}>
            {msg.role === "assistant" && (
              <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-1">
                DW
              </div>
            )}
            <div className={`max-w-lg rounded-2xl px-4 py-3 text-sm ${
              msg.role === "user"
                ? "bg-blue-600 text-white rounded-br-sm"
                : "bg-white border border-gray-200 text-gray-800 rounded-bl-sm shadow-sm"
            }`}>
              {renderMsg(msg.content)}
            </div>
          </div>
        ))}

        {thinking && (
          <div className="flex gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
              DW
            </div>
            <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-sm px-4 py-3 flex gap-1 items-center shadow-sm">
              {[0,1,2].map(n => (
                <div key={n} className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                  style={{ animationDelay: `${n * 0.15}s` }}/>
              ))}
            </div>
          </div>
        )}
        <div ref={chatEndRef}/>
      </div>

      {/* Suggested questions */}
      {loaded && messages.length <= 2 && (
        <div className="max-w-3xl mx-auto w-full px-6 pb-3 flex-shrink-0">
          <div className="text-xs text-gray-400 mb-2">Ask your advisor:</div>
          <div className="flex flex-wrap gap-2">
            {SUGGESTED.map(q => (
              <button key={q} onClick={() => sendMessage(q)}
                className="text-xs bg-white border border-gray-200 rounded-full px-3 py-1.5 hover:border-blue-400 hover:text-blue-600 text-gray-600 transition-colors">
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="bg-white border-t border-gray-200 px-6 py-3 flex-shrink-0">
        <div className="max-w-3xl mx-auto flex gap-3 items-end">
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
            }}
            placeholder="Ask anything about your business..."
            className="flex-1 border border-gray-300 rounded-xl px-4 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button onClick={() => sendMessage()}
            disabled={!input.trim() || thinking}
            className="bg-blue-600 text-white w-10 h-10 rounded-xl flex items-center justify-center hover:bg-blue-700 disabled:opacity-40 flex-shrink-0 text-lg">
            →
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdvisorPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center text-gray-400">
        Loading...
      </div>
    }>
      <AdvisorChat />
    </Suspense>
  );
}
