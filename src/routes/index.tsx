import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Sparkles, Bot, Zap, Brain } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Landing,
  head: () => ({
    meta: [
      { title: "PolyChat — Multi-Model AI Assistant" },
      {
        name: "description",
        content:
          "Auto-routed AI chat across GPT-5 and Gemini 2.5 for fast, accurate query resolution.",
      },
      { property: "og:title", content: "PolyChat — Multi-Model AI Assistant" },
      {
        property: "og:description",
        content: "Auto-routed AI chat across GPT-5 and Gemini for fast, accurate query resolution.",
      },
    ],
  }),
});

function Landing() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) navigate({ to: "/chat" });
  }, [user, loading, navigate]);

  return (
    <main
      className="min-h-screen"
      style={{ background: "var(--gradient-subtle)" }}
    >
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2">
          <div
            className="grid h-9 w-9 place-items-center rounded-lg text-primary-foreground"
            style={{ background: "var(--gradient-primary)" }}
          >
            <Sparkles className="h-5 w-5" />
          </div>
          <span className="text-lg font-semibold">PolyChat</span>
        </div>
        <Link to="/auth">
          <Button variant="ghost">Sign in</Button>
        </Link>
      </header>

      <section className="mx-auto max-w-4xl px-6 pb-20 pt-12 text-center sm:pt-20">
        <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
          One chat.{" "}
          <span
            className="bg-clip-text text-transparent"
            style={{ backgroundImage: "var(--gradient-primary)" }}
          >
            Many minds.
          </span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base text-muted-foreground sm:text-lg">
          PolyChat automatically routes every question to the best AI model — GPT-5 for code,
          Gemini 2.5 Pro for reasoning, and Gemini 2.5 Flash for fast answers. No keys, no setup.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link to="/auth">
            <Button
              size="lg"
              className="text-base"
              style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-elegant)" }}
            >
              Start chatting free
            </Button>
          </Link>
        </div>

        <div className="mt-16 grid gap-4 sm:grid-cols-3">
          <FeatureCard
            icon={<Brain className="h-5 w-5" />}
            title="Smart routing"
            desc="Each question is sent to the best model for the job."
          />
          <FeatureCard
            icon={<Zap className="h-5 w-5" />}
            title="Streaming replies"
            desc="Watch answers appear in real time, token by token."
          />
          <FeatureCard
            icon={<Bot className="h-5 w-5" />}
            title="Saved history"
            desc="Sign in and your conversations stay with you."
          />
        </div>
      </section>
    </main>
  );
}

function FeatureCard({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-5 text-left">
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-md bg-accent text-accent-foreground">
        {icon}
      </div>
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
    </div>
  );
}
