/**
 * AI Tab Organizer & Naming Engine for Cloud Workspace Launcher.
 *
 * Capabilities:
 *   - Autoname tab groups based on all tabs available in each group.
 *   - Auto-color tab groups based on a specialized tech-focused color scheme:
 *       • "blue":   Code, Development & Git (GitHub, GitLab, StackOverflow, localhost, IDE)
 *       • "cyan":   Cloud, DevOps & Infrastructure (AWS, GCP, Azure, Docker, K8s, Databases)
 *       • "purple": AI, Machine Learning & LLMs (ChatGPT, Claude, HuggingFace, Gemini, Colab)
 *       • "red":    Debugging, Security & Monitoring (Sentry, Datadog, Logs, Issue trackers)
 *       • "green":  Documentation, Technical Specs & Learning (MDN, DevDocs, Wikipedia, RFCs)
 *       • "yellow": Project Management & Productivity (Jira, Notion, Trello, Google Docs)
 *       • "pink":   Design & UI/UX (Figma, Canva, Dribbble, Icons, Design systems)
 *       • "orange": Communication, Community & Media (Slack, Discord, Twitter/X, Reddit, YouTube)
 *       • "grey":   General, Utilities, Search & Shopping
 *   - Multi-provider support: Google Gemini, Anthropic Claude, OpenAI, and
 *     a high-precision Built-in Heuristic Engine that requires zero API keys.
 */

// Supported Chrome tab group colors
export const CHROME_TAB_COLORS = [
  "grey",
  "blue",
  "red",
  "yellow",
  "green",
  "pink",
  "purple",
  "cyan",
  "orange",
];

// Tech-focused color scheme taxonomy
export const COLOR_TAXONOMY = {
  DEV_CODE: {
    color: "blue",
    category: "Development & Code",
    desc: "Coding, GitHub repos, PRs, localhost, Stack Overflow, frameworks",
  },
  CLOUD_DEVOPS: {
    color: "cyan",
    category: "Cloud & DevOps",
    desc: "AWS, GCP, Azure, Docker, K8s, databases, CI/CD, cloud consoles",
  },
  AI_ML: {
    color: "purple",
    category: "AI & Machine Learning",
    desc: "ChatGPT, Claude, HuggingFace, OpenAI, LLM tools, Jupyter, Colab",
  },
  DEBUG_SECURITY: {
    color: "red",
    category: "Debug & Security",
    desc: "Sentry, Datadog, crash logs, bug trackers, vulnerability audits",
  },
  DOCS_LEARNING: {
    color: "green",
    category: "Docs & Research",
    desc: "MDN, DevDocs, official documentation, Wikipedia, papers, tutorials",
  },
  WORK_PRODUCTIVITY: {
    color: "yellow",
    category: "Work & Planning",
    desc: "Jira, Notion, Trello, Asana, Google Docs/Sheets, Linear",
  },
  DESIGN_CREATIVE: {
    color: "pink",
    category: "Design & UI/UX",
    desc: "Figma, Canva, Dribbble, icon sets, color palettes, typography",
  },
  COMM_SOCIAL: {
    color: "orange",
    category: "Social & Media",
    desc: "Slack, Discord, Twitter/X, Reddit, YouTube, tech discussions",
  },
  GENERAL_MISC: {
    color: "grey",
    category: "General & Misc",
    desc: "Search results, shopping, utilities, miscellaneous sites",
  },
};

const DEFAULT_TIMEOUT_MS = 3500;

/**
 * Clean and normalize a string for pattern matching.
 */
function normalizeText(text) {
  return String(text || "").toLowerCase().trim();
}

/**
 * Extract clean domain name without subdomains where possible.
 */
function extractDomain(url) {
  try {
    const u = new URL(url);
    return u.hostname.toLowerCase();
  } catch {
    return "";
  }
}

/**
 * Extract URL path parts.
 */
function extractPath(url) {
  try {
    const u = new URL(url);
    return u.pathname.toLowerCase();
  } catch {
    return "";
  }
}

/**
 * Intelligent single-tab heuristic classifier.
 * Inspects URL, hostname, title, and query patterns to determine the tech category.
 */
export function classifyTab(tab) {
  const url = tab.url || "";
  const title = normalizeText(tab.title);
  const domain = extractDomain(url);
  const path = extractPath(url);
  const combined = `${domain} ${path} ${title}`;

  // 1. AI, ML, LLMs (purple)
  if (
    /chatgpt\.com|openai\.com|claude\.ai|anthropic\.com|huggingface\.co|aistudio\.google|perplexity\.ai|mistral\.ai|replicate\.com|deepseek\.com|groq\.com|cohere\.com|midjourney\.com/.test(domain) ||
    /colab\.research\.google\.com|kaggle\.com/.test(domain) ||
    combined.includes("jupyter") ||
    /\b(chatgpt|gpt-4|gpt-3|claude|gemini|llm|llms|transformer|diffusion|pytorch|tensorflow|langchain|ollama|deep learning|machine learning)\b/.test(combined)
  ) {
    return {
      type: "AI_ML",
      color: "purple",
      topic: "AI",
      label: "AI & ML",
    };
  }

  // 2. Cloud, DevOps, Infra & Databases (cyan)
  if (
    /console\.aws\.amazon\.com|aws\.amazon\.com|console\.cloud\.google\.com|portal\.azure\.com/.test(domain) ||
    /docker\.com|kubernetes\.io|terraform\.io|vercel\.com|netlify\.com|cloudflare\.com/.test(domain) ||
    /digitalocean\.com|render\.com|railway\.app|heroku\.com|planetscale\.com|supabase\.com/.test(domain) ||
    /mongodb\.com|postgresql\.org|redis\.io|elastic\.co|mysql\.com/.test(domain) ||
    /\b(aws console|google cloud|azure portal|k8s|kubernetes|docker|terraform|serverless|lambda|ec2|s3 bucket|devops|ci\/cd|pipeline|postgres|mongodb|redis|graphql api|database cluster)\b/.test(combined)
  ) {
    return {
      type: "CLOUD_DEVOPS",
      color: "cyan",
      topic: "Cloud",
      label: "Cloud & DevOps",
    };
  }

  // 3. Debugging, Monitoring & Security (red)
  if (
    /sentry\.io|datadoghq\.com|datadog\.com|splunk\.com|newrelic\.com|grafana\.com/.test(domain) ||
    /cve\.mitre\.org|exploit-db\.com|virustotal\.com|hackerone\.com|shodan\.io|snyk\.io|owasp\.org/.test(domain) ||
    /\b(sentry|datadog|stacktrace|stack trace|error 500|uncaught exception|fatal error|cve-|vulnerability|exploit|penetration test|incident response|security alert|crash log)\b/.test(combined)
  ) {
    return {
      type: "DEBUG_SECURITY",
      color: "red",
      topic: "Debug",
      label: "Debug & Security",
    };
  }

  // 4. Code, Development & Git (blue)
  if (
    /github\.com|gitlab\.com|bitbucket\.org|stackoverflow\.com|stackexchange\.com/.test(domain) ||
    /npmjs\.com|pypi\.org|crates\.io|pkg\.go\.dev|maven\.org|rubygems\.org/.test(domain) ||
    /codepen\.io|jsfiddle\.net|codesandbox\.io|replit\.com|stackblitz\.com|leetcode\.com|hackerrank\.com/.test(domain) ||
    /localhost|127\.0\.0\.1|0\.0\.0\.0|vscode\.dev/.test(domain) ||
    /\b(github|gitlab|pull request|pull requests|commit|commits|repository|merge request|diff|pr #|issues #|git branch|typescript|javascript|python|golang|rust-lang|c\+\+|react|vue|angular|svelte|next\.js|nuxt|vite|webpack|eslint|tailwind)\b/.test(combined)
  ) {
    return {
      type: "DEV_CODE",
      color: "blue",
      topic: "Code",
      label: "Dev & Code",
    };
  }

  // 5. Documentation & Technical Learning (green)
  if (
    /developer\.mozilla\.org|devdocs\.io|w3schools\.com|wikipedia\.org|arxiv\.org/.test(domain) ||
    /coursera\.org|udemy\.com|edx\.org|khanacademy\.org|freecodecamp\.org|geeksforgeeks\.org/.test(domain) ||
    domain.startsWith("docs.") ||
    domain.startsWith("learn.") ||
    path.startsWith("/docs") ||
    path.startsWith("/documentation") ||
    path.startsWith("/guide") ||
    path.startsWith("/tutorial") ||
    /\b(documentation|cheatsheet|whitepaper|rfc|specification|handbook|api docs|api reference|getting started)\b/.test(combined)
  ) {
    return {
      type: "DOCS_LEARNING",
      color: "green",
      topic: "Docs",
      label: "Docs & Learning",
    };
  }

  // 6. Project Management & Workspace (yellow)
  if (
    /atlassian\.net|jira|trello\.com|notion\.so|asana\.com|linear\.app|monday\.com|clickup\.com|miro\.com|basecamp\.com/.test(domain) ||
    /docs\.google\.com|sheets\.google\.com|slides\.google\.com|drive\.google\.com|airtable\.com/.test(domain) ||
    /\b(jira|sprint|backlog|kanban|task|ticket|meeting notes|roadmap|gantt|project plan|spreadsheet)\b/.test(combined)
  ) {
    return {
      type: "WORK_PRODUCTIVITY",
      color: "yellow",
      topic: "Work",
      label: "Work & Tasks",
    };
  }

  // 7. Design & UI/UX (pink)
  if (
    /figma\.com|canva\.com|dribbble\.com|behance\.net|unsplash\.com|pexels\.com|fontawesome\.com|iconify\.design|lucide\.dev|coolors\.co|colorhunt\.co|adobe\.com/.test(domain) ||
    /\b(figma|ui design|ux design|wireframe|prototype|mockup|vector art|typography|design system|svg icon|color palette)\b/.test(combined)
  ) {
    return {
      type: "DESIGN_CREATIVE",
      color: "pink",
      topic: "Design",
      label: "Design & UI",
    };
  }

  // 8. Communication, Community & Media (orange)
  if (
    /slack\.com|discord\.com|twitter\.com|x\.com|reddit\.com|linkedin\.com|youtube\.com|twitch\.tv|spotify\.com|news\.ycombinator\.com|medium\.com|dev\.to|mail\.google\.com/.test(domain) ||
    /\b(slack|discord|tweet|twitter|reddit|youtube video|podcast|community forum|hacker news)\b/.test(combined)
  ) {
    return {
      type: "COMM_SOCIAL",
      color: "orange",
      topic: "Social",
      label: "Social & Media",
    };
  }

  // 9. General / Misc (grey)
  return {
    type: "GENERAL_MISC",
    color: "grey",
    topic: "General",
    label: "General",
  };
}

/**
 * Generates an intelligent, human-readable name for a group of tabs
 * using the smart built-in heuristic engine (zero API key needed).
 */
export function heuristicAutonameGroup(tabs) {
  if (!tabs || tabs.length === 0) {
    return { title: "Tabs", color: "grey" };
  }

  // Tally classifications
  const categoryCounts = {};
  const domains = [];
  const repos = new Set();
  const projects = new Set();

  for (const t of tabs) {
    const classification = classifyTab(t);
    categoryCounts[classification.type] = (categoryCounts[classification.type] || 0) + 1;

    const domain = extractDomain(t.url);
    if (domain) domains.push(domain);

    // Extract GitHub repo if present
    if (domain === "github.com" || domain === "gitlab.com") {
      const parts = extractPath(t.url).split("/").filter(Boolean);
      if (parts.length >= 2) {
        repos.add(parts[1]); // repo name
        if (parts[0]) projects.add(parts[0]); // user / org
      }
    }

    // Extract common frameworks or tech names from titles
    const title = normalizeText(t.title);
    const techMatches = title.match(/\b(react|vue|angular|svelte|nextjs|next\.js|node|python|rust|golang|docker|kubernetes|aws|fastapi|django|tailwind|figma|graphql)\b/i);
    if (techMatches) {
      projects.add(techMatches[0]);
    }
  }

  // Find dominant category
  let dominantType = "GENERAL_MISC";
  let maxCount = -1;
  for (const [type, count] of Object.entries(categoryCounts)) {
    if (count > maxCount) {
      maxCount = count;
      dominantType = type;
    }
  }

  const tax = COLOR_TAXONOMY[dominantType] || COLOR_TAXONOMY.GENERAL_MISC;
  let title = tax.category;

  // Refine title if specific project/repo or domain is shared
  if (repos.size === 1) {
    const repo = Array.from(repos)[0];
    title = `${repo.slice(0, 15)} (Dev)`;
  } else if (projects.size === 1) {
    const proj = Array.from(projects)[0];
    const cap = proj.charAt(0).toUpperCase() + proj.slice(1);
    title = `${cap} Dev`;
  } else if (domains.every((d) => d === domains[0]) && domains[0]) {
    // All tabs share the exact same domain
    const d = domains[0].replace(/^www\./, "").split(".")[0];
    const cap = d.charAt(0).toUpperCase() + d.slice(1);
    title = `${cap} (${tax.category.split(" ")[0]})`;
  } else {
    // Refine generic categories into concise tab labels (max 2-3 words)
    switch (dominantType) {
      case "DEV_CODE":
        title = "Code & Dev";
        break;
      case "CLOUD_DEVOPS":
        title = "Cloud & Infra";
        break;
      case "AI_ML":
        title = "AI & LLMs";
        break;
      case "DEBUG_SECURITY":
        title = "Debug & Security";
        break;
      case "DOCS_LEARNING":
        title = "Docs & Guides";
        break;
      case "WORK_PRODUCTIVITY":
        title = "Work & Planning";
        break;
      case "DESIGN_CREATIVE":
        title = "Design & UI";
        break;
      case "COMM_SOCIAL":
        title = "Social & Media";
        break;
      default:
        title = "General Tabs";
        break;
    }
  }

  return {
    title: title.slice(0, 24),
    color: tax.color,
  };
}

/**
 * Organizes ungrouped tabs into clustered groups using heuristics.
 */
export function heuristicOrganizeTabs(tabs) {
  if (!tabs || tabs.length < 2) return [];

  // Group tabs by classification type
  const clusters = new Map();
  tabs.forEach((tab, index) => {
    const cls = classifyTab(tab);
    if (!clusters.has(cls.type)) {
      clusters.set(cls.type, []);
    }
    clusters.get(cls.type).push({ tab, originalIndex: index });
  });

  const groups = [];
  for (const [type, items] of clusters.entries()) {
    // Only group if there are at least 2 tabs in the cluster,
    // OR if it's a prominent tech category with 1 tab and we don't have too many groups
    const clusterTabs = items.map((i) => i.tab);
    const { title, color } = heuristicAutonameGroup(clusterTabs);

    groups.push({
      title,
      color,
      tabIndices: items.map((i) => i.originalIndex),
      tabs: clusterTabs,
    });
  }

  // Sort groups so larger or tech groups come first
  groups.sort((a, b) => b.tabIndices.length - a.tabIndices.length);
  return groups;
}

/* ==========================================================================
   AI LLM Integrations (Google Gemini, Anthropic Claude, OpenAI)
   ========================================================================== */

/**
 * Call Google Gemini API (gemini-2.0-flash / gemini-1.5-flash)
 */
async function callGemini(apiKey, systemInstruction, prompt, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const model = "gemini-2.0-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemInstruction }],
        },
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 500,
          responseMimeType: "application/json",
        },
      }),
    });
    if (!res.ok) {
      throw new Error(`Gemini API error ${res.status}`);
    }
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("Gemini returned no content");
    return text.trim();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Call Anthropic Claude Messages API
 */
async function callClaude(apiKey, systemPrompt, prompt, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const url = "https://api.anthropic.com/v1/messages";

  try {
    const res = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 500,
        system: systemPrompt,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) {
      throw new Error(`Anthropic API error ${res.status}`);
    }
    const data = await res.json();
    const text = data?.content?.[0]?.text;
    if (!text) throw new Error("Anthropic returned no content");
    return text.trim();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Call OpenAI API (gpt-4o-mini)
 */
async function callOpenAI(apiKey, systemPrompt, prompt, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const url = "https://api.openai.com/v1/chat/completions";

  try {
    const res = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!res.ok) {
      throw new Error(`OpenAI API error ${res.status}`);
    }
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    if (!text) throw new Error("OpenAI returned no content");
    return text.trim();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Universal AI prompt runner that routes to the configured provider
 * (Gemini, Claude, OpenAI) or falls back.
 */
async function runAiPrompt(settings, systemPrompt, userPrompt, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const provider = settings?.aiProvider || "auto";
  const geminiKey = settings?.geminiApiKey?.trim();
  const anthropicKey = (settings?.anthropicApiKey || settings?.aiApiKey)?.trim();
  const openAiKey = settings?.openaiApiKey?.trim();

  // Route based on provider preference or available keys
  if ((provider === "gemini" || (provider === "auto" && geminiKey)) && geminiKey) {
    return await callGemini(geminiKey, systemPrompt, userPrompt, { timeoutMs });
  }
  if ((provider === "anthropic" || (provider === "auto" && anthropicKey)) && anthropicKey) {
    return await callClaude(anthropicKey, systemPrompt, userPrompt, { timeoutMs });
  }
  if ((provider === "openai" || (provider === "auto" && openAiKey)) && openAiKey) {
    return await callOpenAI(openAiKey, systemPrompt, userPrompt, { timeoutMs });
  }

  throw new Error("No configured AI API key found (falling back to smart heuristics).");
}

/* ==========================================================================
   Public High-Level AI Functions
   ========================================================================== */

/**
 * Autoname a specific group of tabs based on all available tabs in that group,
 * and assign a color according to the tech-focused color scheme.
 *
 * @param {Array} tabs - Array of tab objects in the group
 * @param {Object} settings - Extension settings (contains AI keys)
 * @returns {Promise<{ title: string, color: string }>}
 */
export async function autonameTabGroup(tabs, settings = {}) {
  if (!tabs || tabs.length === 0) {
    return { title: "Tab Group", color: "grey" };
  }

  // Attempt LLM generation first if an AI key is available
  try {
    const payload = tabs.map((t) => ({ title: t.title, url: t.url }));
    const systemPrompt = `You are a browser tab organizer. Analyze all tabs in the provided group and output a JSON object with:
"title": a concise label (1-3 words, max 20 chars) capturing the common context (e.g. "React Development", "AWS Infra", "AI Assistants", "Design Assets").
"color": exact Chrome tab color according to this tech-focused color scheme:
  - "blue": Code, Development & Git (GitHub, GitLab, repos, localhost, IDE)
  - "cyan": Cloud, DevOps & Infrastructure (AWS, GCP, Azure, Docker, K8s, DBs)
  - "purple": AI, Machine Learning & LLMs (ChatGPT, Claude, HuggingFace, OpenAI)
  - "red": Debugging, Security & Monitoring (Sentry, Datadog, Logs, Issue trackers)
  - "green": Documentation, Tech Specs & Learning (MDN, Wikipedia, guides, tutorials)
  - "yellow": Project Management & Tasks (Jira, Notion, Trello, Google Docs)
  - "pink": Design & UI/UX (Figma, Canva, assets, design systems)
  - "orange": Social, Community & Media (Slack, Discord, Reddit, YouTube)
  - "grey": General & Misc
Output strict JSON with format: {"title": "...", "color": "..."}`;

    const userPrompt = `Tabs in this group:\n${JSON.stringify(payload.slice(0, 25))}`;
    const raw = await runAiPrompt(settings, systemPrompt, userPrompt, { timeoutMs: 3000 });
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      if (parsed.title && CHROME_TAB_COLORS.includes(parsed.color)) {
        return {
          title: parsed.title.trim().slice(0, 24),
          color: parsed.color,
        };
      }
    }
  } catch (err) {
    // Fall back to smart heuristic
  }

  // Guaranteed deterministic heuristic fallback
  return heuristicAutonameGroup(tabs);
}

/**
 * Autoname and group all available tabs into categorized groups with
 * tech-focused color scheming.
 *
 * @param {Array} tabs - All tabs to group
 * @param {Object} settings - Extension settings
 * @returns {Promise<Array<{ title: string, color: string, tabIndices: number[] }>>}
 */
export async function organizeAllTabsWithAI(tabs, settings = {}) {
  if (!tabs || tabs.length < 2) return [];

  // Attempt LLM clustering if an AI key is available
  try {
    const payload = tabs.map((t, i) => ({
      index: i,
      title: t.title,
      url: t.url,
    }));

    const systemPrompt = `You are an expert browser tab organizer. Analyze all provided tabs and group them into logical, thematic groups.
Output a strict JSON array of objects, where each object has:
- "title": concise label (1 to 3 words, max 20 chars).
- "color": ONE of ["blue", "cyan", "purple", "red", "green", "yellow", "pink", "orange", "grey"].
  Follow this strict color scheme:
  • "blue": Development, Code, Repos (GitHub, GitLab, StackOverflow, localhost)
  • "cyan": Cloud, DevOps, Infrastructure (AWS, GCP, Docker, K8s, Databases)
  • "purple": AI, Machine Learning & LLMs (ChatGPT, Claude, HuggingFace)
  • "red": Debugging, Security & Logs (Sentry, Datadog, Errors, Audits)
  • "green": Docs, Research & Learning (MDN, tutorials, specifications)
  • "yellow": Work, Planning & Productivity (Jira, Notion, Trello, Google Docs)
  • "pink": Design & UI/UX (Figma, Canva, Assets)
  • "orange": Social, Comms & Media (Slack, Discord, Twitter, Reddit, YouTube)
  • "grey": General & Utilities
- "tabIndices": array of integer indices belonging to this group.
Every tab should be assigned to the most fitting group. Minimum 1 tab per group.
Output strict JSON with format: [{"title":"...","color":"...","tabIndices":[0,1]}]`;

    const userPrompt = `Group these ${tabs.length} tabs:\n${JSON.stringify(payload.slice(0, 50))}`;
    const raw = await runAiPrompt(settings, systemPrompt, userPrompt, { timeoutMs: 4000 });
    const match = raw.match(/\[[\s\S]*\]/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const valid = parsed
          .filter(
            (g) =>
              g &&
              typeof g.title === "string" &&
              CHROME_TAB_COLORS.includes(g.color) &&
              Array.isArray(g.tabIndices) &&
              g.tabIndices.every((i) => Number.isInteger(i) && i >= 0 && i < tabs.length)
          )
          .map((g) => ({
            title: g.title.trim().slice(0, 24),
            color: g.color,
            tabIndices: g.tabIndices,
          }));

        if (valid.length > 0) {
          return valid;
        }
      }
    }
  } catch (err) {
    // Fall back to heuristic organize
  }

  return heuristicOrganizeTabs(tabs);
}

/**
 * Summarize an entire workspace of tabs into a concise workspace title (2-4 words).
 */
export async function generateWorkspaceNameAI(tabs, settings = {}) {
  if (!tabs || tabs.length === 0) return null;

  try {
    const payload = tabs.map((t) => ({ title: t.title, url: t.url }));
    const systemPrompt = `You are a concise workspace summarizer. Given a list of browser tabs, produce a 2-4 word contextual title capturing the main project or workflow (e.g. 'React App Development', 'AWS Cloud Infrastructure', 'AI Prompt Engineering'). Return ONLY the title in plain text, with no quotes or punctuation.`;
    const userPrompt = `Summarize this workspace:\n${JSON.stringify(payload.slice(0, 20))}`;

    const raw = await runAiPrompt(settings, systemPrompt, userPrompt, { timeoutMs: 2500 });
    const cleaned = raw.replace(/^["'`]+|["'`]+$/g, "").replace(/[.!?]+$/g, "").trim();
    const words = cleaned.split(/\s+/).filter(Boolean).slice(0, 4);
    if (words.length > 0) return words.join(" ");
  } catch {
    // Heuristic workspace naming
  }

  // Heuristic fallback for workspace name
  const topGroup = heuristicAutonameGroup(tabs);
  return `${topGroup.title} Workspace`;
}

/**
 * Predict critical tabs to keep loaded during lazy restore.
 */
export async function predictCriticalTabsAI(tabs, settings = {}) {
  if (!tabs || tabs.length === 0) return [0];

  try {
    const payload = tabs.map((t, i) => ({ i, title: t.title, url: t.url }));
    const systemPrompt = `You are a tab-usage predictor. Given a list of tabs, identify 2-3 most active tabs (editors, dashboards, active consoles) versus passive reference tabs. Return ONLY a JSON array of 0-based tab indices e.g. [0, 2].`;
    const userPrompt = `Which tabs should stay loaded?\n${JSON.stringify(payload.slice(0, 30))}`;

    const raw = await runAiPrompt(settings, systemPrompt, userPrompt, { timeoutMs: 2500 });
    const match = raw.match(/\[[^\]]*\]/);
    if (match) {
      const arr = JSON.parse(match[0]);
      if (Array.isArray(arr) && arr.length > 0) {
        return arr.filter((n) => Number.isInteger(n) && n >= 0 && n < tabs.length);
      }
    }
  } catch {
    // Fall back to keeping first active or first tab
  }

  const activeIdx = tabs.findIndex((t) => t.active);
  return activeIdx >= 0 ? [activeIdx] : [0];
}
