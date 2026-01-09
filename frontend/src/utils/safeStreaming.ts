// src/utils/safeStreaming.ts
/**
 * Utility functions for safe streaming of markdown/LaTeX content.
 * Ensures we don't cut in the middle of formatting constructs.
 */

/**
 * Check if position is inside a LaTeX display math block ($$...$$)
 */
function isInsideDisplayMath(text: string): boolean {
  const matches = text.match(/\$\$/g) || [];
  return matches.length % 2 !== 0;
}

/**
 * Check if position is inside a LaTeX inline math block ($...$)
 * Handles escaped dollars (\$) and avoids confusion with $$
 */
function isInsideInlineMath(text: string): boolean {
  // Remove escaped dollars and display math first
  const cleaned = text.replace(/\\\$/g, "").replace(/\$\$/g, "");
  const matches = cleaned.match(/\$/g) || [];
  return matches.length % 2 !== 0;
}

/**
 * Check if position is inside a LaTeX environment (\begin{...}...\end{...})
 */
function isInsideLatexEnvironment(text: string): boolean {
  const beginMatches = text.match(/\\begin\{[^}]+\}/g) || [];
  const endMatches = text.match(/\\end\{[^}]+\}/g) || [];
  return beginMatches.length > endMatches.length;
}

/**
 * Check if position is inside a code block (```...```)
 */
function isInsideCodeBlock(text: string): boolean {
  const matches = text.match(/```/g) || [];
  return matches.length % 2 !== 0;
}

/**
 * Check if position is inside inline code (`...`)
 * Avoids confusion with code blocks
 */
function isInsideInlineCode(text: string): boolean {
  // Remove code blocks first
  const withoutCodeBlocks = text.replace(/```[\s\S]*?```/g, "");
  const matches = withoutCodeBlocks.match(/(?<!`)`(?!`)/g) || [];
  return matches.length % 2 !== 0;
}

/**
 * Check if position is inside bold (**...**)
 */
function isInsideBold(text: string): boolean {
  const matches = text.match(/\*\*/g) || [];
  return matches.length % 2 !== 0;
}

/**
 * Check if position is inside italic (*...* but not **)
 */
function isInsideItalic(text: string): boolean {
  // Remove bold markers first
  const withoutBold = text.replace(/\*\*/g, "");
  const matches = withoutBold.match(/\*/g) || [];
  return matches.length % 2 !== 0;
}

/**
 * Check if position is inside a markdown link [text](url)
 */
function isInsideLink(text: string): boolean {
  // Check for unclosed [ or (
  const lastOpenBracket = text.lastIndexOf("[");
  const lastCloseBracket = text.lastIndexOf("]");
  const lastOpenParen = text.lastIndexOf("](");
  const lastCloseParen = text.lastIndexOf(")");

  // Inside link text [...]
  if (lastOpenBracket > lastCloseBracket) {
    return true;
  }

  // Inside link URL ](...)
  if (lastOpenParen > lastCloseParen && lastOpenParen > lastCloseBracket) {
    return true;
  }

  return false;
}

/**
 * Check if we're in the middle of a heading line (# ...)
 * Returns true if the last line starts with # but doesn't end with newline
 */
function isInsideHeading(text: string): boolean {
  const lastNewline = text.lastIndexOf("\n");
  const lastLine = lastNewline >= 0 ? text.substring(lastNewline + 1) : text;
  return /^#{1,6}\s/.test(lastLine) && !lastLine.endsWith("\n");
}

/**
 * Find the last safe position to cut the text.
 * Returns a position where all markdown/LaTeX constructs are complete.
 */
function findLastSafePosition(text: string): number {
  // If text is empty or very short, return as is
  if (text.length <= 1) return text.length;

  // Check each construct and find where it started
  let safePos = text.length;

  // Check display math ($$...$$) - highest priority
  if (isInsideDisplayMath(text)) {
    const lastDoubleDollar = text.lastIndexOf("$$");
    if (lastDoubleDollar >= 0) {
      safePos = Math.min(safePos, lastDoubleDollar);
    }
  }

  // Check inline math ($...$)
  if (isInsideInlineMath(text.substring(0, safePos))) {
    // Find the last unescaped single $ that's not part of $$
    let lastSingleDollar = -1;
    for (let i = safePos - 1; i >= 0; i--) {
      if (text[i] === "$") {
        const isEscaped = i > 0 && text[i - 1] === "\\";
        const isDoubleBefore = i > 0 && text[i - 1] === "$";
        const isDoubleAfter = i < text.length - 1 && text[i + 1] === "$";
        if (!isEscaped && !isDoubleBefore && !isDoubleAfter) {
          lastSingleDollar = i;
          break;
        }
      }
    }
    if (lastSingleDollar >= 0) {
      safePos = Math.min(safePos, lastSingleDollar);
    }
  }

  // Check LaTeX environments
  if (isInsideLatexEnvironment(text.substring(0, safePos))) {
    const lastBegin = text.lastIndexOf("\\begin{");
    if (lastBegin >= 0) {
      safePos = Math.min(safePos, lastBegin);
    }
  }

  // Check code blocks (```)
  if (isInsideCodeBlock(text.substring(0, safePos))) {
    const lastTripleBacktick = text.lastIndexOf("```");
    if (lastTripleBacktick >= 0) {
      safePos = Math.min(safePos, lastTripleBacktick);
    }
  }

  // Check inline code (`)
  if (isInsideInlineCode(text.substring(0, safePos))) {
    // Find last single backtick not part of triple
    for (let i = safePos - 1; i >= 0; i--) {
      if (text[i] === "`") {
        const isTripleBefore = i >= 2 && text.substring(i - 2, i + 1) === "```";
        const isTripleAfter = i <= text.length - 3 && text.substring(i, i + 3) === "```";
        if (!isTripleBefore && !isTripleAfter) {
          safePos = Math.min(safePos, i);
          break;
        }
      }
    }
  }

  // Check bold (**)
  if (isInsideBold(text.substring(0, safePos))) {
    const lastDoubleStar = text.lastIndexOf("**");
    if (lastDoubleStar >= 0) {
      safePos = Math.min(safePos, lastDoubleStar);
    }
  }

  // Check italic (*)
  if (isInsideItalic(text.substring(0, safePos))) {
    // Find last single * not part of **
    for (let i = safePos - 1; i >= 0; i--) {
      if (text[i] === "*") {
        const isDoubleBefore = i > 0 && text[i - 1] === "*";
        const isDoubleAfter = i < text.length - 1 && text[i + 1] === "*";
        if (!isDoubleBefore && !isDoubleAfter) {
          safePos = Math.min(safePos, i);
          break;
        }
      }
    }
  }

  // Check links [text](url)
  if (isInsideLink(text.substring(0, safePos))) {
    const lastOpenBracket = text.lastIndexOf("[");
    if (lastOpenBracket >= 0) {
      safePos = Math.min(safePos, lastOpenBracket);
    }
  }

  // Check headings - if in middle of heading, go to start of line
  const textToCheck = text.substring(0, safePos);
  if (isInsideHeading(textToCheck)) {
    const lastNewline = textToCheck.lastIndexOf("\n");
    if (lastNewline >= 0) {
      safePos = Math.min(safePos, lastNewline + 1);
    } else {
      safePos = 0; // Heading at start of text
    }
  }

  return safePos;
}

/**
 * Get safe streaming content for a target position.
 * Returns the text that can be safely rendered without broken formatting.
 */
export function getSafeStreamContent(fullText: string, targetPosition: number): string {
  if (targetPosition >= fullText.length) {
    return fullText;
  }

  const substring = fullText.substring(0, targetPosition);
  const safePos = findLastSafePosition(substring);

  return fullText.substring(0, safePos);
}

/**
 * Calculate the next target position for streaming.
 * Moves forward by a chunk but respects word boundaries for smoother display.
 */
export function getNextStreamPosition(
  currentPos: number,
  fullText: string,
  chunkSize: number = 5
): number {
  const targetPos = Math.min(currentPos + chunkSize, fullText.length);

  // Try to land on a word boundary for smoother streaming
  if (targetPos < fullText.length) {
    // Look for the next space or newline within a small window
    const windowEnd = Math.min(targetPos + 10, fullText.length);
    for (let i = targetPos; i < windowEnd; i++) {
      if (fullText[i] === " " || fullText[i] === "\n") {
        return i + 1;
      }
    }
  }

  return targetPos;
}

/**
 * Stream content with callback, handling safe positions automatically.
 */
export function createSafeStreamer(
  fullText: string,
  onUpdate: (content: string) => void,
  onComplete: () => void,
  intervalMs: number = 10,
  chunkSize: number = 5
): { start: () => void; stop: () => void } {
  let position = 0;
  let intervalId: ReturnType<typeof setInterval> | null = null;

  const start = () => {
    intervalId = setInterval(() => {
      position = getNextStreamPosition(position, fullText, chunkSize);
      const safeContent = getSafeStreamContent(fullText, position);
      onUpdate(safeContent);

      if (position >= fullText.length) {
        if (intervalId) {
          clearInterval(intervalId);
          intervalId = null;
        }
        // Ensure final content is complete
        onUpdate(fullText);
        onComplete();
      }
    }, intervalMs);
  };

  const stop = () => {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  };

  return { start, stop };
}

export default {
  getSafeStreamContent,
  getNextStreamPosition,
  createSafeStreamer,
};
