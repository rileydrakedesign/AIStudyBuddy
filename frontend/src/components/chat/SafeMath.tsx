// src/components/chat/SafeMath.tsx
import React, { Component, ErrorInfo, ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

interface Props {
  children: string;
  className?: string;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

/**
 * Error boundary specifically for math/KaTeX rendering errors.
 * Falls back to displaying raw text when KaTeX fails to parse.
 */
class MathErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, State> {
  constructor(props: { children: ReactNode; fallback: ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: "" };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error.message };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.warn("KaTeX rendering error caught:", error.message);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

/**
 * Pre-process markdown to fix common LaTeX issues before rendering.
 * This helps prevent KaTeX parse errors.
 */
function preprocessMath(content: string): string {
  let processed = content;

  // Fix matrices that are missing \begin{bmatrix} but have \end{bmatrix}
  // Look for patterns like: $$ content with & and \\ but no \begin{...matrix}
  processed = processed.replace(
    /\$\$\s*([^$]*?(?:&|\\\\)[^$]*?)\\end\{([a-z]?matrix)\}\s*\$\$/g,
    (match, content, matrixType) => {
      if (!content.includes(`\\begin{${matrixType}}`)) {
        return `$$\\begin{${matrixType}}${content}\\end{${matrixType}}$$`;
      }
      return match;
    }
  );

  // Fix incomplete matrix environments - if we see \end{bmatrix} without \begin{bmatrix}
  processed = processed.replace(
    /\$\$\s*([^$]*?)\\end\{(bmatrix|pmatrix|vmatrix|Vmatrix|matrix)\}\s*\$\$/g,
    (match, content, matrixType) => {
      if (!content.includes(`\\begin{${matrixType}}`)) {
        return `$$\\begin{${matrixType}}${content}\\end{${matrixType}}$$`;
      }
      return match;
    }
  );

  // Ensure align environments are properly wrapped
  processed = processed.replace(
    /\$\$\s*([^$]*?)\\end\{(align|aligned|equation)\*?\}\s*\$\$/g,
    (match, content, envType) => {
      const fullEnvType = match.includes('*') ? `${envType}*` : envType;
      if (!content.includes(`\\begin{${fullEnvType}}`)) {
        return `$$\\begin{${fullEnvType}}${content}\\end{${fullEnvType}}$$`;
      }
      return match;
    }
  );

  return processed;
}

/**
 * Render markdown with raw text fallback (no math processing).
 * Used when KaTeX fails.
 */
const RawTextFallback: React.FC<{ content: string }> = ({ content }) => (
  <ReactMarkdown remarkPlugins={[remarkGfm]}>
    {content}
  </ReactMarkdown>
);

/**
 * SafeMath component - renders markdown with KaTeX math support
 * and gracefully falls back to raw text if parsing fails.
 */
const SafeMath: React.FC<Props> = ({ children, className }) => {
  // Pre-process to fix common issues
  const processedContent = preprocessMath(children);

  // Fallback content without math processing
  const fallback = <RawTextFallback content={children} />;

  return (
    <MathErrorBoundary fallback={fallback}>
      <div className={className}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeKatex]}
          components={{
            // Custom paragraph to avoid extra margins
            p: ({ children }) => (
              <span style={{ display: "block", margin: "0 0 0.5em 0" }}>
                {children}
              </span>
            ),
          }}
        >
          {processedContent}
        </ReactMarkdown>
      </div>
    </MathErrorBoundary>
  );
};

/**
 * Hook to safely render inline math with fallback.
 * Returns the processed content and a flag indicating if it's safe to render.
 */
export function useSafeMath(content: string): { processed: string; isValid: boolean } {
  try {
    const processed = preprocessMath(content);
    // Basic validation - check for balanced delimiters
    const singleDollars = (processed.match(/(?<!\$)\$(?!\$)/g) || []).length;
    const doubleDollars = (processed.match(/\$\$/g) || []).length;

    const isValid = singleDollars % 2 === 0 && doubleDollars % 2 === 0;
    return { processed, isValid };
  } catch {
    return { processed: content, isValid: false };
  }
}

export default SafeMath;
