import { memo } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { readableQuestionText } from "@/lib/question-text";

const components: Components = {
  p: ({ children }) => <p className="whitespace-pre-line">{children}</p>,
  h1: ({ children }) => <h2 className="font-semibold">{children}</h2>,
  h2: ({ children }) => <h2 className="font-semibold">{children}</h2>,
  h3: ({ children }) => <h3 className="font-semibold">{children}</h3>,
  h4: ({ children }) => <h4 className="font-semibold">{children}</h4>,
  h5: ({ children }) => <h5 className="font-semibold">{children}</h5>,
  h6: ({ children }) => <h6 className="font-semibold">{children}</h6>,
  ul: ({ children }) => <ul className="list-disc space-y-1 pl-6">{children}</ul>,
  ol: ({ children, start }) => <ol start={start} className="list-decimal space-y-1 pl-6">{children}</ol>,
  li: ({ children }) => <li className="space-y-1">{children}</li>,
  hr: () => <hr className="border-border" />,
  blockquote: ({ children }) => <blockquote className="space-y-3 border-l-2 pl-4 text-muted-foreground">{children}</blockquote>,
  table: ({ children }) => (
    <div role="region" aria-label="Scrollable clinical data table" tabIndex={0} className="max-w-full overflow-x-auto rounded-xl border focus-visible:outline-2 focus-visible:outline-emerald-600">
      <table className="w-full min-w-[28rem] border-collapse text-left text-sm font-normal leading-6">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-muted/70">{children}</thead>,
  tr: ({ children }) => <tr className="border-b last:border-b-0">{children}</tr>,
  th: ({ children, style }) => <th scope="col" style={style} className="px-4 py-3 align-top font-semibold">{children}</th>,
  td: ({ children, style }) => <td style={style} className="px-4 py-3 align-top">{children}</td>,
  a: ({ children, href }) => href ? <a href={href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{children}</a> : <span>{children}</span>,
  // Clinical figures have their own authenticated image loader in the player.
  img: ({ alt }) => <span>{alt}</span>,
};

/** Render bank text as React elements, without interpreting embedded HTML. */
export const QuestionContent = memo(function QuestionContent({ text, className, highlightRegion }: { text: string; className?: string; highlightRegion?: string }) {
  return (
    <div data-highlight-region={highlightRegion} className={cn("min-w-0 space-y-4 break-words", className)}>
      <Markdown remarkPlugins={[remarkGfm]} components={components} skipHtml>{readableQuestionText(text)}</Markdown>
    </div>
  );
});
