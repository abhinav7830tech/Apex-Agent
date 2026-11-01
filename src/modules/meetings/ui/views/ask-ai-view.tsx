"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { Loader2Icon, SendIcon, SparklesIcon } from "lucide-react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useTRPC } from "@/trpc/client";

const suggestions = [
  "What decisions were made across my recent meetings?",
  "List every open action item and who owns it.",
  "Which meetings discussed pricing or roadmap?",
  "Summarize unresolved questions from this month.",
];

export const AskAiView = () => {
  const trpc = useTRPC();
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<{
    answer: string;
    sources: { id: string; name: string; date: string | null }[];
  } | null>(null);

  const ask = useMutation(
    trpc.meetings.askAI.mutationOptions({
      onSuccess: (data) => {
        setResult(data);
      },
      onError: (error) => {
        toast.error(error.message);
      },
    }),
  );

  const submit = () => {
    const trimmed = query.trim();
    if (!trimmed) {
      toast.error("Ask a question first");
      return;
    }
    ask.mutate({ query: trimmed });
  };

  return (
    <div className="mx-auto w-full max-w-4xl p-6 md:p-8">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-[#1a3d2e]">
          <SparklesIcon className="size-6 text-primary" />
          Ask AI
        </h1>
        <p className="text-sm text-muted-foreground">
          Ask questions across all of your analyzed meetings. Answers use only
          your meeting summaries and transcripts.
        </p>
      </div>

      <Card>
        <CardContent className="p-4">
          <Textarea
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Ask about decisions, action items, risks, or anything discussed..."
            rows={4}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                submit();
              }
            }}
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Tip: press Cmd/Ctrl + Enter to ask.
            </p>
            <Button onClick={submit} disabled={ask.isPending}>
              {ask.isPending ? (
                <Loader2Icon className="mr-2 size-4 animate-spin" />
              ) : (
                <SendIcon className="mr-2 size-4" />
              )}
              Ask AI
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="mt-4 flex flex-wrap gap-2">
        {suggestions.map((suggestion) => (
          <Button
            key={suggestion}
            variant="outline"
            size="sm"
            className="h-auto whitespace-normal text-left"
            onClick={() => setQuery(suggestion)}
          >
            {suggestion}
          </Button>
        ))}
      </div>

      {(result || ask.isPending) && (
        <Card className="mt-6">
          <CardContent className="p-5">
            {ask.isPending ? (
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <Loader2Icon className="size-4 animate-spin" />
                Reading your meeting history...
              </div>
            ) : (
              <>
                <div className="prose prose-sm max-w-none dark:prose-invert">
                  <ReactMarkdown>{result?.answer ?? ""}</ReactMarkdown>
                </div>
                {result?.sources && result.sources.length > 0 && (
                  <div className="mt-5 border-t pt-4">
                    <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                      Sources
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {result.sources.map((source) => (
                        <Link
                          key={source.id}
                          href={`/meetings/${source.id}`}
                          className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
                        >
                          {source.name}
                          {source.date
                            ? ` · ${format(new Date(source.date), "MMM d, yyyy")}`
                            : ""}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};
