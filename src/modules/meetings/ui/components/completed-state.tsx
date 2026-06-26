import Link from "next/link";
import Markdown from "react-markdown";

import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsContent, TabsTrigger } from "@/components/ui/tabs";


import { MeetingGetOne } from "../../types";
import {
    BookOpenTextIcon,
    FileTextIcon,
    SparklesIcon,
    FileVideoIcon,
    ClockFadingIcon,
    LoaderIcon,

} from "lucide-react";
import { useState, useEffect } from "react";
import { StreamTranscriptItem } from "../../types";

import { GeneratedAvatar } from "@/components/generated-avatar";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDuration } from "@/lib/utils";
import { useTRPC } from "@/trpc/client";
import { jsPDF } from "jspdf";
import { Input } from "@/components/ui/input";
import { useMutation } from "@tanstack/react-query";interface Props {
    data: MeetingGetOne;
}

export const CompletedState = ({ data }: Props) => {
    const handleExportSummaryPDF = () => {
        const doc = new jsPDF();
        let yPos = 20;
        doc.setFontSize(20);
        doc.text(`Meeting Summary: ${data.name}`, 14, yPos);
        yPos += 10;

        doc.setFontSize(11);
        if (data.startedAt) {
           doc.text(`Date: ${format(new Date(data.startedAt), "PPP")}`, 14, yPos);
           yPos += 8;
        }
        if (data.duration) {
           doc.text(`Duration: ${formatDuration(data.duration)}`, 14, yPos);
           yPos += 8;
        }

        yPos += 5;
        doc.setFontSize(14);
        doc.text('Summary:', 14, yPos);
        yPos += 8;

        doc.setFontSize(11);
        const summaryLines = doc.splitTextToSize(data.summary || "No summary available.", 180);
        doc.text(summaryLines, 14, yPos);
        yPos += summaryLines.length * 6 + 10;

        if ((data as any).sentiment) {
           doc.setFontSize(14);
           doc.text('Sentiment:', 14, yPos);
           doc.setFontSize(11);
           doc.text((data as any).sentiment, 45, yPos);
           yPos += 15;
        }

        doc.save(`${data.name.replace(/\s+/g, "_")}_summary.pdf`);
    };

    return (
        <div className="flex flex-col gap-y-6 animate-in fade-in zoom-in-95 duration-500">
            <Tabs defaultValue="summary" className="w-full">
                
                {/* Updated Navigation Bar Styling */}
                <div className="bg-card shadow-sm border border-border/50 rounded-xl px-2 py-2 mb-4">
                    <ScrollArea>
                        <TabsList className="bg-transparent h-auto p-0 flex space-x-2">
                            <TabsTrigger value="summary"
                                className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none rounded-lg px-4 py-2 text-muted-foreground hover:text-foreground transition-all">
                                <BookOpenTextIcon className="size-4 mr-2" />
                                Summary
                            </TabsTrigger>
                            <TabsTrigger value="transcript"
                                className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none rounded-lg px-4 py-2 text-muted-foreground hover:text-foreground transition-all">
                                <FileTextIcon className="size-4 mr-2" />
                                Transcript
                            </TabsTrigger>
                            <TabsTrigger value="recording"
                                className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none rounded-lg px-4 py-2 text-muted-foreground hover:text-foreground transition-all">
                                <FileVideoIcon className="size-4 mr-2" />
                                Recording
                            </TabsTrigger>
                            <TabsTrigger value="Chat"
                                className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none rounded-lg px-4 py-2 text-muted-foreground hover:text-foreground transition-all">
                                <SparklesIcon className="size-4 mr-2" />
                                Ask AI
                            </TabsTrigger>
                        </TabsList>
                        <ScrollBar orientation="horizontal" />
                    </ScrollArea>
                </div>

                <TabsContent value="recording" className="mt-0 outline-none">
                    <div className="bg-card rounded-xl border border-border/50 shadow-sm px-6 py-6 ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-semibold">Video Recording</h2>
                            {data.recordingUrl && (
                                <Button size="sm" variant="outline" asChild>
                                    <a href={data.recordingUrl} target="_blank" rel="noopener noreferrer" download>
                                        <FileVideoIcon className="size-4 mr-2"/> Download Recording
                                    </a>
                                </Button>
                            )}
                        </div>
                        {data.recordingUrl ? (
                            <div className="rounded-xl overflow-hidden border border-border/50 bg-black/5">
                                <video
                                    src={data.recordingUrl}
                                    className="w-full shadow-inner aspect-video"
                                    controls 
                                />
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground rounded-xl border border-dashed border-border">
                                <FileVideoIcon className="size-10 mb-3 opacity-50" />
                                <p className="font-semibold text-lg text-foreground mb-1">Recording not available</p>
                                <p className="text-sm">The recording is being processed or was not found.</p>
                            </div>
                        )}
                    </div>
                </TabsContent>

                <TabsContent value="summary" className="mt-0 outline-none">
                    <div className="bg-card rounded-xl border border-border/50 shadow-sm relative overflow-hidden ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                        {/* Decorative background gradient */}
                        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl pointer-events-none -z-10" />

                        <div className="px-6 py-8 flex flex-col gap-y-6">
                            
                            {/* Header & Actions */}
                            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                                <div className="space-y-3">
                                    <h2 className="text-3xl font-semibold capitalize tracking-tight">{data.name}</h2>
                                    <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                                        <Link href={`/agents/${data.agent.id}`} className="flex items-center hover:text-primary transition-colors">
                                            <GeneratedAvatar variant="botttsNeutral" seed={data.agent.name} className="size-6 mr-2 ring-2 ring-background" />
                                            <span className="font-medium text-foreground">{data.agent.name}</span>
                                        </Link>
                                        <div className="h-1 w-1 rounded-full bg-border" />
                                        <span>{data.startedAt ? format(data.startedAt, "PPP") : "Unknown Date"}</span>
                                        <div className="h-1 w-1 rounded-full bg-border" />
                                        <Badge variant="secondary" className="flex items-center gap-x-1.5 font-normal">
                                            <ClockFadingIcon className="size-3" />
                                            {data.duration ? formatDuration(data.duration) : "N/A"}
                                        </Badge>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                     <Button size="sm" variant="outline" onClick={handleExportSummaryPDF} className="shrink-0 bg-background hover:bg-muted">
                                         <FileTextIcon className="size-4 mr-2"/> Export Summary
                                     </Button>
                                </div>
                            </div>

                            <div className="h-px w-full bg-border/50" />

                            {/* Summary Content */}
                            <div className="space-y-4">
                                <div className="flex items-center gap-x-2 text-primary font-medium tracking-wide text-sm uppercase">
                                    <SparklesIcon className="size-4" />
                                    <h3>Comprehensive Summary</h3>
                                </div>
                                
                                <div className="prose prose-sm md:prose-base prose-slate dark:prose-invert max-w-none prose-headings:font-semibold text-foreground/90 leading-relaxed">
                                    <Markdown>{data.summary || "No summary available."}</Markdown>
                                </div>
                            </div>

                            {/* Structured AI Outputs */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                                {(data as any).sentiment && (
                                    <div className="space-y-3 p-5 rounded-xl border border-border/50 bg-background/50">
                                      <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">Overall Sentiment</h3>
                                      <Badge className={`px-3 py-1 text-sm font-medium ${
                                        (data as any).sentiment === 'Positive' ? 'bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 border-emerald-500/20' :
                                        (data as any).sentiment === 'Negative' ? 'bg-red-500/10 text-red-600 hover:bg-red-500/20 border-red-500/20' : 
                                        'bg-slate-500/10 text-slate-600 hover:bg-slate-500/20 border-slate-500/20'
                                      }`} variant="outline">
                                        {(data as any).sentiment}
                                      </Badge>
                                    </div>
                                )}

                                {(data as any).keyDecisions?.length > 0 && (
                                    <div className="space-y-3 p-5 rounded-xl border border-border/50 bg-background/50">
                                      <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">Key Decisions</h3>
                                      <ul className="space-y-2">
                                          {(data as any).keyDecisions.map((dec: string, i: number) => (
                                              <li key={i} className="flex gap-2 text-sm text-foreground/80">
                                                <span className="text-primary font-bold">•</span> {dec}
                                              </li>
                                          ))}
                                      </ul>
                                    </div>
                                )}
                            </div>

                            {(data as any).actionItems && (
                                <div className="space-y-4 mt-2">
                                  <div className="flex items-center gap-x-2 text-primary font-medium tracking-wide text-sm uppercase">
                                      <SparklesIcon className="size-4" />
                                      <h3>Action Items</h3>
                                  </div>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                  {(()=>{
                                     try {
                                        const actions = JSON.parse((data as any).actionItems);
                                        return actions.map((act: any, i: number) => (
                                           <div key={i} className="flex items-center justify-between bg-background/50 p-4 rounded-xl border border-border/50 shadow-sm hover:border-border transition-colors">
                                              <span className="text-sm font-medium text-foreground/90">{act.task}</span>
                                              <Badge variant="secondary" className="ml-4 shrink-0 bg-primary/10 text-primary hover:bg-primary/20">{act.assignedTo}</Badge>
                                           </div>
                                        ));
                                     } catch { return null; }
                                  })()}
                                  </div>
                                </div>
                            )}

                        </div>
                    </div>
                </TabsContent>

                <TabsContent value="transcript" className="mt-0 outline-none">
                    <div className="bg-card rounded-xl border border-border/50 shadow-sm p-6 ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                        {data.transcriptUrl ? (
                            <TranscriptView url={data.transcriptUrl} agentId={data.agent.id} agentName={data.agent.name} meetingName={data.name} meetingDate={data.startedAt} />
                        ) : (
                            <div className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground rounded-xl border border-dashed border-border">
                                <FileTextIcon className="size-10 mb-3 opacity-50" />
                                <p className="font-semibold text-lg text-foreground mb-1">No transcript available</p>
                                <p className="text-sm">The transcript could not be found for this meeting.</p>
                            </div>
                        )}
                    </div>
                </TabsContent>

                <TabsContent value="Chat" className="mt-0 outline-none">
                    <div className="bg-card rounded-xl border border-border/50 shadow-sm p-6 ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                      <AskAI meetingId={data.id} />
                    </div>
                </TabsContent>
            </Tabs>
        </div >
    );
};

interface TranscriptViewProps {
    url: string;
    agentId: string;
    agentName: string;
    meetingName: string;
    meetingDate: Date | string | null;
}

const TranscriptView = ({ url, agentId, agentName, meetingName, meetingDate }: TranscriptViewProps) => {
    const [transcript, setTranscript] = useState<StreamTranscriptItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setLoading(true);
        setError(null);
        fetch(url)
            .then((res) => {
                if (!res.ok) {
                    throw new Error(`Failed to fetch transcript: ${res.statusText}`);
                }
                return res.text();
            })
            .then((text) => {
                try {
                    const data = JSON.parse(text);
                    if (Array.isArray(data)) {
                        setTranscript(data);
                        return;
                    }
                } catch {}

                try {
                    const lines = text.split('\n').filter(line => line.trim() !== '');
                    const data = lines.map(line => JSON.parse(line));
                    setTranscript(data);
                } catch (err) {
                    setError("Failed to parse transcript.");
                }
            })
            .catch(() => {
                setError("Failed to load transcript.");
            })
            .finally(() => setLoading(false));
    }, [url]);

    const handleExportPDF = () => {
        const doc = new jsPDF();
        let yPos = 20;
        doc.setFontSize(16);
        doc.text(`Transcript: ${meetingName}`, 14, yPos);
        yPos += 8;
        doc.setFontSize(10);
        if (meetingDate) {
           doc.text(`Date: ${format(new Date(meetingDate), "PPP")}`, 14, yPos);
           yPos += 10;
        }

        doc.setFontSize(12);
        transcript.forEach((item) => {
            const speaker = item.speaker_id === agentId ? agentName : "User";
            const text = `${speaker} [${formatDuration(item.start_ts)}]: ${item.text}`;
            const splitText = doc.splitTextToSize(text, 180);
            
            if (yPos + (splitText.length * 6) > 280) {
                doc.addPage();
                yPos = 20;
            }
            doc.text(splitText, 14, yPos);
            yPos += splitText.length * 6;
        });

        doc.save(`${meetingName.replace(/\s+/g, "_")}_transcript.pdf`);
    };

    if (loading) {
        return (
            <div className="flex justify-center p-8">
                <LoaderIcon className="size-6 animate-spin text-muted-foreground" />
            </div>
        )
    }

    if (error) {
        return <div className="text-center text-red-500 p-8">{error}</div>;
    }

    if (!transcript.length) {
        return <div className="text-center text-muted-foreground p-8">Transcript is empty.</div>;
    }

    return (
        <div className="flex flex-col gap-y-4">
            <div className="flex justify-end">
                <Button size="sm" variant="outline" onClick={handleExportPDF}>
                    <FileTextIcon className="size-4 mr-2"/> Export as PDF
                </Button>
            </div>
            <div className="flex flex-col gap-y-4 p-4 max-h-[500px] overflow-y-auto bg-slate-50 border rounded-lg">
                {transcript.map((item, index) => (
                    <div key={index} className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-muted-foreground">
                                {item.speaker_id === agentId ? agentName : "User"}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                                {formatDuration(item.start_ts)}
                            </span>
                        </div>
                        <p className="text-sm leading-relaxed">
                            {item.text}
                        </p>
                    </div>
                ))}
            </div>
        </div>
    )
}

function AskAI({ meetingId }: { meetingId: string }) {
    const trpc = useTRPC();
    const [query, setQuery] = useState("");
    const [result, setResult] = useState("");

    const searchMutation = useMutation(
        trpc.meetings.smartSearch.mutationOptions({
            onSuccess: (data) => setResult(data.result),
        })
    );

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        if (query.trim()) {
            searchMutation.mutate({ meetingId, query });
        }
    };

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2 mb-2">
                <SparklesIcon className="size-5 text-purple-500" />
                <h3 className="text-lg font-semibold">Semantic Smart Search</h3>
            </div>
            <form onSubmit={handleSearch} className="flex gap-2">
                <Input 
                   value={query} 
                   onChange={(e) => setQuery(e.target.value)} 
                   placeholder="e.g. When did we discuss API?" 
                   disabled={searchMutation.isPending}
                />
                <Button type="submit" disabled={searchMutation.isPending}>
                    {searchMutation.isPending ? "Searching..." : "Search"}
                </Button>
            </form>

            {result && (
                <div className="mt-4 p-4 bg-purple-50 border border-purple-100 rounded-lg whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
                    {result}
                </div>
            )}
        </div>
    )
}