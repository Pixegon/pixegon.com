import { createLaptopScene } from "./laptop-scene";

type MotionMode = "cinematic" | "calm" | "off";
type LaptopScene = ReturnType<typeof createLaptopScene>;

export interface SiteControllerOptions {
  motion?: MotionMode;
  asciiDensity?: number;
  glowStrength?: number;
}

interface StackCategory {
  key: string;
  label: string;
  tech: string[];
}

interface CodeSegment {
  text: string;
  color: string;
}

type CodeLine = CodeSegment[];

interface PixelCell extends HTMLDivElement {
  threshold: number;
  active: boolean;
}

interface MetricPoint {
  rx: number;
  ry: number;
  ox: number;
  oy: number;
  delay: number;
  glyphIndex: number;
  finalGlyph: string;
  accent: boolean;
}

interface MetricMorph {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  masks: HTMLElement[];
  rules: HTMLElement[];
  points: MetricPoint[] | null;
  fade: number;
  shown: boolean;
  done: boolean;
  fontSize: number;
  wasVisible?: boolean;
  wait?: number;
  viewportWidth?: number;
  viewportHeight?: number;
  width: number;
  height: number;
}

interface StoredStyle {
  value: string;
  priority: string;
}

interface ContactErrors {
  name: boolean;
  email: boolean;
  message: boolean;
}

interface LegacyMediaQueryList {
  addListener(listener: (event: MediaQueryListEvent) => void): void;
  removeListener(listener: (event: MediaQueryListEvent) => void): void;
}

const STACK_CATEGORIES: StackCategory[] = [
  {
    key: "frontend",
    label: "Frontend",
    tech: ["React", "Angular", "Vue.js", "Next.js", "TypeScript", "Tailwind", "SASS / SCSS"],
  },
  {
    key: "backend",
    label: "Backend",
    tech: ["Node.js", "PHP", "Python", "Ruby on Rails", "Go", "Java / Spring", "REST APIs", "GraphQL"],
  },
  {
    key: "databases",
    label: "Databases",
    tech: ["MongoDB", "PostgreSQL", "MySQL", "BigQuery", "Redis", "Firebase", "DynamoDB", "Elasticsearch"],
  },
  {
    key: "cloud",
    label: "Cloud & DevOps",
    tech: ["AWS", "Google Cloud", "Azure", "Docker", "Kubernetes", "Terraform", "GitHub Actions", "CircleCI"],
  },
  {
    key: "mobile",
    label: "Mobile",
    tech: ["React Native", "Swift / iOS", "Kotlin / Android", "Flutter", "Expo"],
  },
  {
    key: "ai",
    label: "AI & Machine Learning",
    tech: ["Claude API", "OpenAI", "LangChain", "LlamaIndex", "RAG", "Fine-tuning", "Pinecone", "pgvector", "AI Agents"],
  },
];

const STACK_COLORS = {
  keyword: "#61B8F0",
  identifier: "#E8F4FF",
  string: "#89D6F5",
  punctuation: "#7E93B4",
} as const;

const EMPTY_ERRORS: ContactErrors = {
  name: false,
  email: false,
  message: false,
};

function cssPropertyName(property: string): string {
  return property.replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`);
}

function finiteNumber(value: string | undefined, fallback: number): number {
  if (value == null || value.trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isMotionMode(value: string | undefined): value is MotionMode {
  return value === "cinematic" || value === "calm" || value === "off";
}

export class SiteController {
  public readonly root: HTMLElement;

  private readonly options: Required<SiteControllerOptions>;
  private readonly abortController = new AbortController();
  private readonly observers: IntersectionObserver[] = [];
  private readonly styleOverrides = new WeakMap<HTMLElement, Map<string, StoredStyle>>();
  private readonly bandTransforms = new WeakMap<HTMLElement, string>();
  private readonly narrowQuery: MediaQueryList;

  private scene: LaptopScene | null = null;
  private metricMorph: MetricMorph | null = null;
  private pixelCells: PixelCell[] = [];
  private bands: HTMLElement[] | null = null;
  private resizeHandler: (() => void) | null = null;
  private narrowHandler: (() => void) | null = null;
  private fontTimeout: number | null = null;
  private animationFrame = 0;
  private mounted = false;
  private destroyed = false;
  private reduced = false;
  private calm = false;
  private shuffled = false;
  private fontFallbackForced = false;
  private layoutInitialized = false;
  private narrow = false;
  private verticalServices: boolean | null = null;
  private menuOpen = false;
  private activeStackIndex = 0;
  private scrollSpy = "";
  private scrollSpyTime = 0;
  private headerCondensed: boolean | null = null;
  private heroProgress: number | null = null;
  private serviceProgress: number | null = null;
  private serviceIndex: number | null = null;
  private scenePaused = false;
  private irisRadius: string | null = null;
  private contactTitleScale: string | null = null;

  constructor(root: HTMLElement, options: SiteControllerOptions = {}) {
    this.root = root;

    const datasetMotion = root.dataset.motion;
    const motion = options.motion ?? (isMotionMode(datasetMotion) ? datasetMotion : "cinematic");
    this.options = {
      motion,
      asciiDensity: options.asciiDensity ?? finiteNumber(root.dataset.asciiDensity, 1.4),
      glowStrength: options.glowStrength ?? finiteNumber(root.dataset.glowStrength, 0.7),
    };

    this.narrowQuery = window.matchMedia("(max-width: 980px)");
  }

  public mount(): this {
    if (this.mounted || this.destroyed) return this;
    this.mounted = true;
    this.initialize();
    return this;
  }

  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.abortController.abort();

    if (this.resizeHandler) window.removeEventListener("resize", this.resizeHandler);
    if (this.fontTimeout != null) window.clearTimeout(this.fontTimeout);
    if (this.animationFrame) window.cancelAnimationFrame(this.animationFrame);
    if (this.scene) this.scene.destroy();

    for (const observer of this.observers) {
      try {
        observer.disconnect();
      } catch {
        // The observed document may already have been detached during navigation.
      }
    }

    if (this.narrowHandler) {
      if (typeof this.narrowQuery.removeEventListener === "function") {
        this.narrowQuery.removeEventListener("change", this.narrowHandler);
      } else {
        (this.narrowQuery as unknown as LegacyMediaQueryList).removeListener(this.narrowHandler);
      }
    }

    this.scene = null;
    this.metricMorph = null;
  }

  private initialize(): void {
    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    this.reduced = reducedMotionQuery.matches || this.options.motion === "off";
    this.calm = this.options.motion === "calm";

    this.bindMenu();
    this.bindStackTabs();
    this.bindContactForm();
    this.bindPointerAndTickerInteractions();
    this.updateFooterYear();
    this.renderStack(0, false);

    // Defer the procedural canvas until the static content has mounted.
    const canvas = this.el<HTMLCanvasElement>("lap");
    if (canvas) {
      Promise.resolve().then(() => {
        if (this.destroyed) return;
        try {
          this.scene = createLaptopScene(canvas, {
            density: this.options.asciiDensity,
            glow: this.options.glowStrength,
            reduced: this.reduced,
            calm: this.calm,
          });
        } catch {
          this.scene = null;
        }
      });
    }

    this.createGrainOverlays();
    this.createPixelGrid();

    if (!this.reduced && !this.shuffled) {
      this.shuffled = true;
      const outlasts = this.el("outlasts");
      const logoWord = this.el("logoWord");
      if (outlasts) this.shuffle(outlasts, "Outlasts", 700);
      if (logoWord) this.shuffle(logoWord, "pixegon", 520);
    }

    this.setupReveals();
    this.setupSceneAnimations();
    this.setupMetricMorph();
    this.setupStoryDrawIn();

    this.narrowHandler = () => this.applyLayout();
    if (typeof this.narrowQuery.addEventListener === "function") {
      this.narrowQuery.addEventListener("change", this.narrowHandler);
    } else {
      (this.narrowQuery as unknown as LegacyMediaQueryList).addListener(this.narrowHandler);
    }
    this.applyLayout();

    if (this.reduced) this.applyReducedMotion();

    const loop = (): void => {
      if (this.destroyed) return;
      try {
        this.tick();
      } catch {
        // A missing optional section should not stop the rest of the page motion.
      }
      this.animationFrame = window.requestAnimationFrame(loop);
    };
    this.animationFrame = window.requestAnimationFrame(loop);
  }

  private el<T extends HTMLElement = HTMLElement>(name: string): T | null {
    return this.root.querySelector<T>(`[data-px="${name}"]`);
  }

  private query<T extends HTMLElement = HTMLElement>(selector: string): T[] {
    return Array.from(this.root.querySelectorAll<T>(selector));
  }

  private smoothStep(progress: number, start: number, end: number): number {
    const value = Math.min(1, Math.max(0, (progress - start) / (end - start)));
    return value * value * (3 - 2 * value);
  }

  private overrideStyle(element: HTMLElement, property: string, value: string): void {
    const cssProperty = cssPropertyName(property);
    let overrides = this.styleOverrides.get(element);
    if (!overrides) {
      overrides = new Map<string, StoredStyle>();
      this.styleOverrides.set(element, overrides);
    }
    if (!overrides.has(cssProperty)) {
      overrides.set(cssProperty, {
        value: element.style.getPropertyValue(cssProperty),
        priority: element.style.getPropertyPriority(cssProperty),
      });
    }
    element.style.setProperty(cssProperty, value);
  }

  private resetStyles(element: HTMLElement | null): void {
    if (!element) return;
    const overrides = this.styleOverrides.get(element);
    if (!overrides) return;

    for (const [property, stored] of overrides) {
      if (stored.value) element.style.setProperty(property, stored.value, stored.priority);
      else element.style.removeProperty(property);
    }
    this.styleOverrides.delete(element);
  }

  private bindMenu(): void {
    const button = this.root.querySelector<HTMLButtonElement>(
      '[data-menu-toggle], [data-px="menuBtn"]',
    );
    if (!button) return;

    const menu = this.findOrCreateMobileMenu(button);
    if (!menu) return;

    button.addEventListener(
      "click",
      () => this.setMenuOpen(!this.menuOpen),
      { signal: this.abortController.signal },
    );
    menu.addEventListener(
      "click",
      (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        if (target.closest("a, [data-menu-close]")) this.setMenuOpen(false);
      },
      { signal: this.abortController.signal },
    );

    this.setMenuOpen(false);
  }

  private findOrCreateMobileMenu(button: HTMLButtonElement): HTMLElement | null {
    const existing = this.root.querySelector<HTMLElement>(
      '[data-mobile-menu], [data-px="mobileNav"], header nav[aria-label="Mobile"]',
    );
    if (existing) return existing;

    const header = button.closest("header");
    if (!header) return null;

    const menu = document.createElement("nav");
    menu.dataset.mobileMenu = "";
    menu.setAttribute("aria-label", "Mobile");
    menu.style.cssText =
      "display:flex;flex-direction:column;gap:4px;padding:18px clamp(20px,5vw,72px) 22px;border-top:1px solid rgba(67,164,219,.14);background:rgba(6,11,22,.92);backdrop-filter:blur(16px);animation:pxFadeUp .3s ease both";

    const links = [
      ["#services", "Services"],
      ["#stack", "Stack"],
      ["#about", "About"],
      ["#contact", "Start a Project →"],
    ] as const;

    for (const [href, label] of links) {
      const link = document.createElement("a");
      link.href = href;
      link.dataset.menuClose = "";
      link.textContent = label;
      link.style.cssText = `font:600 17px 'Manrope',sans-serif;color:${
        href === "#contact" ? "#37B6FF" : "#DCE9F8"
      };padding:11px 2px`;
      menu.appendChild(link);
    }

    header.appendChild(menu);
    return menu;
  }

  private setMenuOpen(open: boolean): void {
    this.menuOpen = open;
    const button = this.root.querySelector<HTMLButtonElement>(
      '[data-menu-toggle], [data-px="menuBtn"]',
    );
    const menu = this.root.querySelector<HTMLElement>(
      '[data-mobile-menu], [data-px="mobileNav"], header nav[aria-label="Mobile"]',
    );

    if (button) button.setAttribute("aria-expanded", String(open));
    if (menu) {
      menu.hidden = !open;
      menu.setAttribute("aria-hidden", String(!open));
    }
  }

  private bindStackTabs(): void {
    const tabs = this.stackTabs();
    tabs.forEach((tab, fallbackIndex) => {
      const index = this.stackIndexForTab(tab, fallbackIndex);
      tab.dataset.stackIndex = String(index);
      tab.addEventListener(
        "click",
        () => this.selectStack(index),
        { signal: this.abortController.signal },
      );
      tab.addEventListener(
        "focus",
        () => this.selectStack(index),
        { signal: this.abortController.signal },
      );
      tab.addEventListener(
        "mouseenter",
        () => {
          if (index === this.activeStackIndex) return;
          const label = this.stackTabLabel(tab);
          if (label) label.style.color = "#C3D4EC";
        },
        { signal: this.abortController.signal },
      );
      tab.addEventListener(
        "mouseleave",
        () => {
          if (index === this.activeStackIndex) return;
          const label = this.stackTabLabel(tab);
          if (label) label.style.color = "#6E82A6";
        },
        { signal: this.abortController.signal },
      );
    });
  }

  private stackTabs(): HTMLButtonElement[] {
    const explicit = this.query<HTMLButtonElement>(
      '[data-stack-tab], [data-px="stackTab"]',
    );
    if (explicit.length) return explicit.slice(0, STACK_CATEGORIES.length);
    return Array.from(
      this.root.querySelectorAll<HTMLButtonElement>("#stack button[aria-pressed]"),
    ).slice(0, STACK_CATEGORIES.length);
  }

  private stackIndexForTab(tab: HTMLButtonElement, fallbackIndex: number): number {
    const explicitIndex = Number(tab.dataset.stackIndex);
    if (Number.isInteger(explicitIndex) && explicitIndex >= 0 && explicitIndex < STACK_CATEGORIES.length) {
      return explicitIndex;
    }

    const key = tab.dataset.stackKey ?? tab.dataset.key;
    const keyIndex = STACK_CATEGORIES.findIndex((category) => category.key === key);
    return keyIndex >= 0 ? keyIndex : fallbackIndex;
  }

  private selectStack(index: number): void {
    if (index < 0 || index >= STACK_CATEGORIES.length || index === this.activeStackIndex) return;
    this.renderStack(index, true);
  }

  private renderStack(index: number, animate: boolean): void {
    this.activeStackIndex = index;
    const category = STACK_CATEGORIES[index];
    if (!category) return;

    this.renderStackTabs(index);

    const half = Math.ceil(category.tech.length / 2);
    const rows = this.stackRows();
    if (rows[0]) this.renderTechRow(rows[0], category.tech.slice(0, half), true);
    if (rows[1]) this.renderTechRow(rows[1], category.tech.slice(half), false);

    this.renderStackNodes(index);
    this.renderStackCode(category.key);
    this.updateStackKeyLabels(category.key);

    if (animate) this.animateStackUpdate();
  }

  private renderStackTabs(activeIndex: number): void {
    this.stackTabs().forEach((tab, fallbackIndex) => {
      const index = this.stackIndexForTab(tab, fallbackIndex);
      const category = STACK_CATEGORIES[index];
      if (!category) return;
      const active = index === activeIndex;
      tab.setAttribute("aria-pressed", String(active));
      tab.dataset.stackKey = category.key;

      let indexLabel = tab.querySelector<HTMLElement>("[data-stack-tab-number]");
      let label = this.stackTabLabel(tab);
      if (!indexLabel || !label) {
        tab.replaceChildren();
        indexLabel = document.createElement("span");
        indexLabel.dataset.stackTabNumber = "";
        indexLabel.style.cssText =
          "font:500 11px 'JetBrains Mono',monospace;color:#5A7194;letter-spacing:.08em";
        label = document.createElement("span");
        label.dataset.stackTabLabel = "";
        tab.append(indexLabel, label);
      }

      indexLabel.textContent = `0${index + 1}`;
      label.replaceChildren();
      label.style.fontFamily = "'Space Grotesk',sans-serif";
      label.style.fontSize = "21px";
      label.style.letterSpacing = "-.01em";

      if (active) {
        label.style.fontWeight = "600";
        label.style.color = "#F4F7FD";
        const open = document.createElement("span");
        open.style.color = "#37B6FF";
        open.textContent = "[ ";
        const close = document.createElement("span");
        close.style.color = "#37B6FF";
        close.textContent = " ]";
        label.append(open, document.createTextNode(category.label), close);
      } else {
        label.style.fontWeight = "500";
        label.style.color = "#6E82A6";
        label.style.transition = "color .2s";
        label.textContent = category.label;
      }
    });
  }

  private stackTabLabel(tab: HTMLButtonElement): HTMLElement | null {
    return (
      tab.querySelector<HTMLElement>("[data-stack-tab-label]") ??
      Array.from(tab.children).find((child, index) => index > 0 && child instanceof HTMLElement) as HTMLElement | undefined ??
      null
    );
  }

  private stackRows(): HTMLElement[] {
    const explicit = this.query<HTMLElement>(
      '[data-stack-row], [data-px="stackRow"]',
    );
    return explicit.slice(0, 2);
  }

  private renderTechRow(row: HTMLElement, items: string[], primary: boolean): void {
    const fragment = document.createDocumentFragment();
    items.forEach((item, index) => {
      const wrapper = document.createElement("span");
      wrapper.style.cssText = "display:inline-flex;align-items:baseline;gap:20px";

      const name = document.createElement("span");
      name.textContent = item;
      name.style.cssText = primary
        ? "font:600 clamp(22px,2.1vw,30px) 'Space Grotesk',sans-serif;letter-spacing:-.015em;color:#DCE9F8;white-space:nowrap"
        : "font:500 clamp(19px,1.7vw,25px) 'Space Grotesk',sans-serif;letter-spacing:-.01em;color:#8FA6C9;white-space:nowrap";
      wrapper.appendChild(name);

      if (index < items.length - 1) {
        const separator = document.createElement("span");
        separator.textContent = "/";
        separator.style.cssText = primary
          ? "font:400 17px 'JetBrains Mono',monospace;color:rgba(0,168,232,.6)"
          : "font:400 15px 'JetBrains Mono',monospace;color:rgba(0,168,232,.45)";
        wrapper.appendChild(separator);
      }
      fragment.appendChild(wrapper);
    });
    row.replaceChildren(fragment);
  }

  private stackNodes(): HTMLElement[] {
    const container = this.root.querySelector<HTMLElement>(
      '[data-stack-nodes], [data-px="stackNodes"]',
    );
    if (container) return Array.from(container.children).filter(
      (child): child is HTMLElement => child instanceof HTMLElement,
    );

    return this.query<HTMLElement>(
      '[data-stack-node], [data-px="stackRight"] > div:nth-of-type(2) > div',
    );
  }

  private renderStackNodes(activeIndex: number): void {
    this.stackNodes().forEach((node, index) => {
      const active = index % 6 === activeIndex || Math.floor(index / 2) % 6 === activeIndex;
      node.dataset.stackNodeActive = String(active);

      const dot = node.querySelector<HTMLElement>("[data-stack-node-dot]") ??
        (node.firstElementChild instanceof HTMLElement ? node.firstElementChild : null);
      if (!dot) return;

      let glow = dot.querySelector<HTMLElement>("[data-stack-node-glow]");
      if (!glow && dot.firstElementChild instanceof HTMLElement) {
        glow = dot.firstElementChild;
        glow.dataset.stackNodeGlow = "";
      }

      if (active) {
        if (!glow) {
          glow = document.createElement("div");
          glow.dataset.stackNodeGlow = "";
          glow.style.cssText =
            "position:absolute;inset:1px;border-radius:50%;background:#37B6FF;box-shadow:0 0 12px rgba(55,182,255,.85)";
          dot.appendChild(glow);
        }
        glow.hidden = false;
      } else if (glow) {
        glow.hidden = true;
      }
    });
  }

  private stackCode(key: string): CodeLine[] {
    const K = STACK_COLORS.keyword;
    const I = STACK_COLORS.identifier;
    const T = STACK_COLORS.string;
    const P = STACK_COLORS.punctuation;
    const line = (...segments: Array<[string, string]>): CodeLine =>
      segments.map(([text, color]) => ({ text, color }));

    const code: Record<string, CodeLine[]> = {
      frontend: [
        line(["const ", K], ["ui", I], [" = ", P], ["await ", K], ["pixegon", I], [".frontend({", P]),
        line(["  framework: ", P], ["bestFitFor(problem)", I], [",", P]),
        line(["  accessibility: ", P], ["'AA — always'", T], [",", P]),
        line(["  performance: ", P], ["'60fps'", T]),
        line(["});", P]),
      ],
      backend: [
        line(["const ", K], ["api", I], [" = ", P], ["await ", K], ["pixegon", I], [".backend({", P]),
        line(["  language: ", P], ["'the right one'", T], [",", P]),
        line(["  contracts: ", P], ["['REST', 'GraphQL']", I], [",", P]),
        line(["  builtTo: ", P], ["'outlast the trend'", T]),
        line(["});", P]),
      ],
      databases: [
        line(["const ", K], ["data", I], [" = ", P], ["await ", K], ["pixegon", I], [".store({", P]),
        line(["  model: ", P], ["fitsTheProblem", I], [",", P]),
        line(["  integrity: ", P], ["'non-negotiable'", T], [",", P]),
        line(["  scale: ", P], ["'from day one'", T]),
        line(["});", P]),
      ],
      cloud: [
        line(["const ", K], ["infra", I], [" = ", P], ["await ", K], ["pixegon", I], [".deploy({", P]),
        line(["  architecture: ", P], ["'cloud-native'", T], [",", P]),
        line(["  pipeline: ", P], ["'commit → production'", T], [",", P]),
        line(["  cost: ", P], ["optimized", I]),
        line(["});", P]),
      ],
      mobile: [
        line(["const ", K], ["app", I], [" = ", P], ["await ", K], ["pixegon", I], [".mobile({", P]),
        line(["  platforms: ", P], ["['iOS', 'Android']", I], [",", P]),
        line(["  approach: ", P], ["nativeOrCross(problem)", I], [",", P]),
        line(["  qualityBar: ", P], ["'highest'", T]),
        line(["});", P]),
      ],
      ai: [
        line(["const ", K], ["product", I], [" = ", P], ["await ", K], ["pixegon", I], [".build({", P]),
        line(["  strategy, design, engineering,", P]),
        line(["  intelligence: ", P], ["'production-ready'", T], [",", P]),
        line(["  scale", P]),
        line(["});", P]),
      ],
    };

    return code[key] ?? code.frontend;
  }

  private renderStackCode(key: string): void {
    const codeRoot = this.root.querySelector<HTMLElement>(
      '[data-stack-code], [data-px="stackCode"], [data-px="codePanel"] pre',
    );
    if (!codeRoot) return;

    const fragment = document.createDocumentFragment();
    for (const codeLine of this.stackCode(key)) {
      const lineElement = document.createElement("div");
      for (const segment of codeLine) {
        const span = document.createElement("span");
        span.style.color = segment.color;
        span.textContent = segment.text;
        lineElement.appendChild(span);
      }
      fragment.appendChild(lineElement);
    }
    codeRoot.replaceChildren(fragment);
  }

  private updateStackKeyLabels(key: string): void {
    this.query<HTMLElement>("[data-stack-active-key]").forEach((element) => {
      element.textContent = key;
    });
    this.query<HTMLElement>("[data-stack-code-key]").forEach((element) => {
      element.textContent = key;
    });

    const codePanel = this.root.querySelector<HTMLElement>(
      '[data-stack-code-panel], [data-px="codePanel"]',
    );
    const codeHeading = codePanel?.querySelector<HTMLElement>(":scope > div:first-child > span:first-child");
    if (codeHeading && !codeHeading.querySelector("[data-stack-code-key]")) {
      codeHeading.textContent = `// pixegon.stack — ${key}`;
    }

    const stack = this.root.querySelector<HTMLElement>("#stack");
    if (!stack || stack.querySelector("[data-stack-active-key]")) return;
    const candidates = Array.from(stack.querySelectorAll<HTMLElement>("div"));
    const status = candidates.find((candidate) => candidate.textContent?.includes("stack.active"));
    if (!status) return;
    for (const node of Array.from(status.childNodes)) {
      if (node.nodeType === Node.TEXT_NODE && node.nodeValue?.includes("stack.active")) {
        node.nodeValue = ` stack.active → '${key}'`;
        break;
      }
    }
  }

  private animateStackUpdate(): void {
    this.stackRows().forEach((row, index) => {
      row.style.animation = "none";
      void row.offsetWidth;
      row.style.animation = `${index % 2 ? "pxRowR" : "pxRowL"} .55s cubic-bezier(.19,.8,.22,1) both`;
    });

    this.stackNodes().forEach((node, index) => {
      node.animate(
        [
          { opacity: 0, transform: "scale(.6)" },
          { opacity: 1, transform: "scale(1)" },
        ],
        { duration: 240, delay: index * 30, easing: "ease-out", fill: "backwards" },
      );
    });

    const codePanel = this.root.querySelector<HTMLElement>(
      '[data-stack-code-panel], [data-px="codePanel"]',
    );
    if (codePanel) {
      codePanel.style.animation = "none";
      void codePanel.offsetWidth;
      codePanel.style.animation = "pxFadeUp .45s ease both";
    }
  }

  private bindContactForm(): void {
    const form = this.root.querySelector<HTMLFormElement>(
      '[data-contact-form], [data-px="contactForm"], #contact form',
    );
    if (!form) return;

    form.noValidate = true;
    form.addEventListener(
      "submit",
      (event) => this.submitContactForm(event, form),
      { signal: this.abortController.signal },
    );
    this.setContactErrors(EMPTY_ERRORS, form);

    const success = this.root.querySelector<HTMLElement>(
      '[data-contact-success], [data-px="formSuccess"]',
    );
    if (success) success.hidden = true;
  }

  private async submitContactForm(event: SubmitEvent, form: HTMLFormElement): Promise<void> {
    event.preventDefault();

    const value = (name: string): string => {
      const control = form.elements.namedItem(name);
      if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) {
        return control.value.trim();
      }
      return "";
    };

    const name = value("name");
    const email = value("email");
    const message = value("message");
    const errors: ContactErrors = {
      name: !name,
      email: !/^\S+@\S+\.\S+$/.test(email),
      message: !message,
    };

    this.setContactErrors(errors, form);
    if (errors.name || errors.email || errors.message) return;

    const submitButton = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (submitButton?.disabled) return;
    if (submitButton) submitButton.disabled = true;

    try {
      const body = new URLSearchParams();
      new FormData(form).forEach((fieldValue, fieldName) => {
        body.append(fieldName, fieldValue.toString());
      });
      const response = await fetch("/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });
      if (!response.ok) throw new Error(`Form POST failed: ${response.status}`);

      form.hidden = true;
      const success = this.findOrCreateContactSuccess(form);
      success.hidden = false;
    } catch {
      // Netlify only accepts the POST on the deployed site; fall back to a
      // native submit so the message still lands via Netlify's own flow.
      form.submit();
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  }

  private setContactErrors(errors: ContactErrors, form: HTMLFormElement): void {
    const messages: Record<keyof ContactErrors, string> = {
      name: "! required",
      email: "! valid email required",
      message: "! required",
    };

    (Object.keys(messages) as Array<keyof ContactErrors>).forEach((field) => {
      let error = this.root.querySelector<HTMLElement>(`[data-form-error="${field}"]`);
      if (!error) {
        const control = form.elements.namedItem(field);
        const label = control instanceof HTMLElement && control.id
          ? form.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(control.id)}"]`)
          : null;
        if (label) {
          error = document.createElement("span");
          error.dataset.formError = field;
          error.style.cssText = "color:#FF7A7A;letter-spacing:.06em";
          label.appendChild(error);
        }
      }
      if (!error) return;
      error.textContent = messages[field];
      error.hidden = !errors[field];
    });
  }

  private findOrCreateContactSuccess(form: HTMLFormElement): HTMLElement {
    const existing = this.root.querySelector<HTMLElement>(
      '[data-contact-success], [data-px="formSuccess"]',
    );
    if (existing) return existing;

    const success = document.createElement("div");
    success.dataset.contactSuccess = "";
    success.style.cssText =
      "background:rgba(13,24,48,.55);border:1px solid rgba(0,168,232,.35);border-radius:14px;padding:46px;display:flex;flex-direction:column;gap:14px";

    const status = document.createElement("div");
    status.style.cssText = "font:500 13px 'JetBrains Mono',monospace;color:#37B6FF";
    status.textContent = "> message.sent — ok";
    const heading = document.createElement("div");
    heading.style.cssText =
      "font:600 26px 'Space Grotesk',sans-serif;letter-spacing:-.015em;color:#F4F7FD";
    heading.textContent = "Thanks — we read every note.";
    const copy = document.createElement("p");
    copy.style.cssText = "margin:0;font:400 16px/1.7 'Manrope',sans-serif;color:#91A2BD";
    copy.textContent = "A human will get back to you within one business day.";
    success.append(status, heading, copy);
    form.insertAdjacentElement("afterend", success);
    return success;
  }

  private bindPointerAndTickerInteractions(): void {
    const heroOuter = this.el("heroOuter");
    const heroInteractive = this.root.querySelector<HTMLElement>(
      "[data-hero-pointer], [data-hero-interactive]",
    ) ??
      (heroOuter?.firstElementChild instanceof HTMLElement ? heroOuter.firstElementChild : heroOuter);

    if (heroInteractive) {
      heroInteractive.addEventListener(
        "mousemove",
        (event) => this.heroMove(event),
        { signal: this.abortController.signal },
      );
      heroInteractive.addEventListener(
        "mouseleave",
        () => this.scene?.setPointerPx(null),
        { signal: this.abortController.signal },
      );
    }

    const ticker = this.root.querySelector<HTMLElement>(
      '[data-ticker-interaction], [data-screen-label="Capabilities Ticker"], [data-capabilities-ticker]',
    );
    if (ticker) {
      ticker.addEventListener(
        "mouseenter",
        () => this.pauseTicker(ticker, "paused"),
        { signal: this.abortController.signal },
      );
      ticker.addEventListener(
        "mouseleave",
        () => this.pauseTicker(ticker, "running"),
        { signal: this.abortController.signal },
      );
    }
  }

  private pauseTicker(container: HTMLElement, state: "paused" | "running"): void {
    if (this.reduced) return;
    container.querySelectorAll<HTMLElement>("[data-tick]").forEach((ticker) => {
      ticker.style.animationPlayState = state;
    });
  }

  private heroMove(event: MouseEvent): void {
    if (!this.scene || this.reduced) return;
    const currentTarget = event.currentTarget;
    if (!(currentTarget instanceof HTMLElement)) return;
    const rect = currentTarget.getBoundingClientRect();
    this.scene.setPointer(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      ((event.clientY - rect.top) / rect.height) * 2 - 1,
    );

    const canvas = this.el<HTMLCanvasElement>("lap");
    if (canvas) {
      const canvasRect = canvas.getBoundingClientRect();
      this.scene.setPointerPx(event.clientX - canvasRect.left, event.clientY - canvasRect.top);
    }
  }

  private updateFooterYear(): void {
    const year = String(new Date().getFullYear());
    this.query<HTMLElement>("[data-current-year], [data-px=\"year\"]").forEach((element) => {
      element.textContent = year;
    });
  }

  private createGrainOverlays(): void {
    try {
      const noise = document.createElement("canvas");
      noise.width = 120;
      noise.height = 120;
      const context = noise.getContext("2d");
      if (!context) return;
      const image = context.createImageData(120, 120);
      for (let index = 0; index < image.data.length; index += 4) {
        const value = (120 + Math.random() * 135) | 0;
        image.data[index] = value;
        image.data[index + 1] = value;
        image.data[index + 2] = value;
        image.data[index + 3] = 26;
      }
      context.putImageData(image, 0, 0);
      const url = noise.toDataURL();
      this.query<HTMLElement>("[data-grain]").forEach((grain) => {
        grain.style.backgroundImage = `url(${url})`;
        grain.style.backgroundSize = "120px 120px";
      });
    } catch {
      // Grain is decorative and may be omitted when canvas data URLs are blocked.
    }
  }

  private createPixelGrid(): void {
    const grid = this.el("pxgrid");
    if (!grid) return;

    if (!grid.childElementCount) {
      for (let row = 0; row < 9; row += 1) {
        for (let column = 0; column < 16; column += 1) {
          const cell = document.createElement("div");
          cell.style.cssText = "background:#0B1426;opacity:0;transition:opacity .5s ease";
          grid.appendChild(cell);
        }
      }
    }

    this.pixelCells = Array.from(grid.children)
      .filter((child): child is HTMLDivElement => child instanceof HTMLDivElement)
      .slice(0, 9 * 16)
      .map((cell, index) => {
        const row = Math.floor(index / 16);
        const column = index % 16;
        const noise = (
          Math.sin(column * 1.7 + row * 0.9) +
          Math.cos(row * 2.3 - column * 0.6) +
          2
        ) / 4;
        const pixelCell = cell as PixelCell;
        pixelCell.threshold = 0.10 + 0.74 * (noise * 0.55 + Math.random() * 0.45);
        pixelCell.active = false;
        return pixelCell;
      });
  }

  private setupReveals(): void {
    if (this.reduced) return;
    const elements = this.query<HTMLElement>("[data-rv]");
    const viewportHeight = window.innerHeight;

    if (!("IntersectionObserver" in window)) {
      elements.forEach((element) => {
        element.style.opacity = "1";
        element.style.transform = "none";
      });
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting || !(entry.target instanceof HTMLElement)) return;
          entry.target.style.opacity = "1";
          entry.target.style.transform = "none";
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -5% 0px" },
    );

    elements.forEach((element) => {
      const rect = element.getBoundingClientRect();
      if (rect.top <= viewportHeight * 0.92) return;
      const delay = Number.parseInt(element.getAttribute("data-rvd") || "0", 10);
      element.style.opacity = "0";
      element.style.transform = "translateY(30px)";
      element.style.transition =
        `opacity .85s cubic-bezier(.19,.8,.22,1) ${delay}ms, ` +
        `transform .85s cubic-bezier(.19,.8,.22,1) ${delay}ms`;
      observer.observe(element);
    });
    this.observers.push(observer);
  }

  private setupSceneAnimations(): void {
    this.query<HTMLElement>("[data-arun]").forEach((container) => {
      if (!("IntersectionObserver" in window)) return;
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            container.querySelectorAll<HTMLElement>("[data-anim]").forEach((element) => {
              element.style.animationPlayState = "running";
            });
            observer.disconnect();
          });
        },
        { threshold: 0.3 },
      );
      observer.observe(container);
      this.observers.push(observer);
    });
  }

  private setupMetricMorph(): void {
    const section = this.el("metrics");
    if (!section) return;

    const masks = Array.from(section.querySelectorAll<HTMLElement>("[data-mask]"));
    const rules = Array.from(section.querySelectorAll<HTMLElement>("[data-rule]"));
    const canvas = this.el<HTMLCanvasElement>("mcv");
    if (this.reduced || !canvas) {
      masks.forEach((mask) => {
        mask.style.transform = "none";
      });
      rules.forEach((rule) => {
        rule.style.transform = "scaleX(1)";
      });
      if (canvas) canvas.style.display = "none";
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      masks.forEach((mask) => {
        mask.style.opacity = "1";
      });
      rules.forEach((rule) => {
        rule.style.transform = "scaleX(1)";
      });
      canvas.style.display = "none";
      return;
    }

    masks.forEach((mask) => {
      mask.style.opacity = "0";
      mask.style.transition = "opacity .6s ease";
    });
    rules.forEach((rule) => {
      rule.style.transition = "transform 1s cubic-bezier(.19,.8,.22,1)";
    });

    this.metricMorph = {
      canvas,
      context,
      masks,
      rules,
      points: null,
      fade: 0,
      shown: false,
      done: false,
      fontSize: 8,
      width: 0,
      height: 0,
    };
    this.resizeHandler = () => {
      if (this.metricMorph && !this.metricMorph.done) this.metricMorph.points = null;
    };
    window.addEventListener("resize", this.resizeHandler);
  }

  private setupStoryDrawIn(): void {
    const panel = this.el("storyPanel");
    if (!panel) return;

    const reveal = (): void => {
      const strike = this.el("strike");
      const name = this.el("pixName");
      const timeline = this.el("tline");
      if (strike) strike.style.width = "100%";
      if (name) {
        name.style.opacity = "1";
        name.style.transform = "none";
      }
      if (timeline) timeline.style.transform = "scaleY(1)";
    };

    if (!("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          reveal();
          observer.disconnect();
        });
      },
      { threshold: 0.3 },
    );
    observer.observe(panel);
    this.observers.push(observer);
  }

  private tick(): void {
    const viewportHeight = window.innerHeight;
    const scrollPosition = window.scrollY;

    if (!this.scrollSpyTime || performance.now() - this.scrollSpyTime > 200) {
      this.scrollSpyTime = performance.now();
      let current = "";
      ["services", "stack", "about"].forEach((id) => {
        const section = this.root.querySelector<HTMLElement>(`#${id}`);
        if (section && section.getBoundingClientRect().top < viewportHeight * 0.45) current = id;
      });
      const contact = this.root.querySelector<HTMLElement>("#contact");
      if (contact && contact.getBoundingClientRect().top < viewportHeight * 0.45) current = "";

      if (current !== this.scrollSpy) {
        this.scrollSpy = current;
        this.query<HTMLAnchorElement>("[data-spy]").forEach((link) => {
          const active = link.getAttribute("data-spy") === current;
          link.style.color = active ? "#37B6FF" : "#B9C7DC";
          link.style.backgroundSize = active ? "100% 1.5px" : "0% 1.5px";
        });
      }
    }

    const condensed = scrollPosition > 30;
    if (condensed !== this.headerCondensed) {
      this.headerCondensed = condensed;
      const header = this.el("header");
      if (header) {
        header.style.background = condensed ? "rgba(6,11,22,.74)" : "rgba(6,11,22,0)";
        header.style.backdropFilter = condensed ? "blur(16px)" : "none";
        header.style.setProperty("-webkit-backdrop-filter", header.style.backdropFilter);
        header.style.borderBottomColor = condensed ? "rgba(67,164,219,.16)" : "rgba(67,164,219,.07)";
        header.style.paddingTop = condensed ? "10px" : "18px";
        header.style.paddingBottom = condensed ? "10px" : "18px";
      }
    }

    const heroOuter = this.el("heroOuter");
    if (heroOuter) {
      const rect = heroOuter.getBoundingClientRect();
      const progress = Math.min(1, Math.max(0, -rect.top / (rect.height - viewportHeight)));
      if (Math.abs(progress - (this.heroProgress == null ? -1 : this.heroProgress)) > 0.0004) {
        this.heroProgress = progress;
        this.scene?.setProgress(progress);
        if (!this.reduced) {
          const text = this.el("heroText");
          if (text) {
            text.style.transform =
              `translateY(${(-90 * this.smoothStep(progress, 0.25, 0.85)).toFixed(1)}px)`;
            text.style.opacity = String((1 - 0.92 * this.smoothStep(progress, 0.45, 0.85)).toFixed(3));
          }
          if (!this.narrow) {
            const laptop = this.el("lapWrap");
            if (laptop) laptop.style.opacity = String((1 - this.smoothStep(progress, 0.93, 1)).toFixed(3));
          }
          const hint = this.el("scrollHint");
          if (hint) hint.style.opacity = String((0.9 * (1 - this.smoothStep(progress, 0.01, 0.12))).toFixed(3));
        }
      }

      if (this.scene) {
        if (progress >= 0.999 && !this.scenePaused) {
          this.scenePaused = true;
          this.scene.pause();
        } else if (progress < 0.999 && this.scenePaused) {
          this.scenePaused = false;
          this.scene.resume();
        }
      }
    }

    if (this.reduced) return;
    this.tickMetricMorph(viewportHeight);
    this.tickPixelGrid(viewportHeight);
    this.tickServices(viewportHeight);
    this.tickBands(viewportHeight);
    this.tickIris(viewportHeight);
  }

  private tickMetricMorph(viewportHeight: number): void {
    const morph = this.metricMorph;
    if (!morph || morph.done) return;
    const section = this.el("metrics");
    if (!section) return;

    const rect = section.getBoundingClientRect();
    if (rect.top < viewportHeight * 1.75 && rect.bottom > -80) {
      morph.wasVisible = true;
      if (
        morph.points &&
        (viewportHeight !== morph.viewportHeight || window.innerWidth !== morph.viewportWidth)
      ) {
        morph.points = null;
      }
      if (!morph.points) this.buildMetricPoints();
      if (morph.points) {
        const progress = this.smoothStep(
          (viewportHeight * 1.38 - rect.top) / (viewportHeight * 0.60),
          0,
          1,
        );
        this.drawMetricMorph(progress, rect);
      } else {
        morph.wait = (morph.wait || 0) + 1;
        if (morph.wait > 150) {
          morph.done = true;
          morph.canvas.style.display = "none";
          morph.masks.forEach((mask) => {
            mask.style.opacity = "1";
          });
          morph.rules.forEach((rule) => {
            rule.style.transform = "scaleX(1)";
          });
        }
      }
    } else if (morph.wasVisible) {
      morph.wasVisible = false;
      if (morph.viewportWidth) morph.context.clearRect(0, 0, morph.width, morph.height);
    }
  }

  private tickPixelGrid(viewportHeight: number): void {
    if (!this.pixelCells.length) return;
    const wrapper = this.el("pxwrap");
    if (!wrapper) return;
    const rect = wrapper.getBoundingClientRect();
    const progress = Math.min(
      1,
      Math.max(0, (viewportHeight - rect.top) / (viewportHeight * 0.7 + rect.height)),
    );

    this.pixelCells.forEach((cell) => {
      const active = progress > cell.threshold;
      if (active === cell.active) return;
      cell.active = active;
      cell.style.opacity = active ? "1" : "0";
    });
  }

  private tickServices(viewportHeight: number): void {
    if (this.verticalServices) return;
    const outer = this.el("svcOuter");
    if (!outer) return;
    const rect = outer.getBoundingClientRect();
    const progress = Math.min(1, Math.max(0, -rect.top / (rect.height - viewportHeight)));
    if (Math.abs(progress - (this.serviceProgress == null ? -1 : this.serviceProgress)) <= 0.0004) return;
    this.serviceProgress = progress;

    const track = this.el("svcTrack");
    const wrapper = this.el("svcWrap");
    if (track && wrapper) {
      const maximum = Math.max(0, track.scrollWidth - wrapper.clientWidth);
      track.style.transform = `translate3d(${(-progress * maximum).toFixed(1)}px,0,0)`;
    }

    const bar = this.el("svcBar");
    if (bar) bar.style.transform = `scaleX(${progress.toFixed(4)})`;
    const index = Math.min(5, 1 + Math.floor(progress * 5));
    if (index !== this.serviceIndex) {
      this.serviceIndex = index;
      const label = this.el("svcIdx");
      if (label) label.textContent = `0${index} / 05`;
    }
  }

  private tickBands(viewportHeight: number): void {
    const wrapper = this.el("bands");
    if (!wrapper) return;
    const rect = wrapper.getBoundingClientRect();
    const progress = Math.min(
      1,
      Math.max(0, (viewportHeight - rect.top) / (viewportHeight + rect.height * 0.2)),
    );
    this.bands ??= this.query<HTMLElement>("[data-px-band]");

    this.bands.forEach((band, index) => {
      const amount = Math.min(1, Math.max(0, progress * Math.max(1.05, 1.6 - index * 0.11)));
      const transform = (-102 + 102 * amount).toFixed(2);
      if (this.bandTransforms.get(band) === transform) return;
      this.bandTransforms.set(band, transform);
      band.style.transform = `translateX(${transform}%)`;
    });
  }

  private tickIris(viewportHeight: number): void {
    const iris = this.el("iris");
    if (!iris?.parentElement) return;
    const rect = iris.parentElement.getBoundingClientRect();
    const progress = Math.min(
      1,
      Math.max(0, (viewportHeight - rect.top) / (viewportHeight + rect.height * 0.5)),
    );
    const radius = (150 * this.smoothStep(progress, 0.05, 0.95)).toFixed(1);
    if (radius !== this.irisRadius) {
      this.irisRadius = radius;
      iris.style.clipPath = `circle(${radius}% at 50% 100%)`;
    }

    const title = this.el("ctTitle");
    if (!title) return;
    const amount = this.smoothStep(progress, 0.45, 1);
    const scale = (0.955 + 0.045 * amount).toFixed(4);
    if (scale === this.contactTitleScale) return;
    this.contactTitleScale = scale;
    title.style.transform = `scale(${scale})`;
    title.style.opacity = String((0.25 + 0.75 * amount).toFixed(3));
  }

  private buildMetricPoints(): void {
    const morph = this.metricMorph;
    const section = this.el("metrics");
    if (!morph || !section) return;

    try {
      if (
        document.fonts &&
        !document.fonts.check('700 60px "Space Grotesk"') &&
        !this.fontFallbackForced
      ) {
        if (this.fontTimeout == null) {
          this.fontTimeout = window.setTimeout(() => {
            this.fontFallbackForced = true;
          }, 2500);
        }
        return;
      }
    } catch {
      // Continue with the available font when the Font Loading API is restricted.
    }

    const sectionRect = section.getBoundingClientRect();
    if (sectionRect.width < 10 || sectionRect.height < 10) return;
    const deviceScale = Math.min(window.devicePixelRatio || 1, 1.6);
    if (
      morph.viewportWidth !== window.innerWidth ||
      morph.viewportHeight !== window.innerHeight
    ) {
      morph.viewportWidth = window.innerWidth;
      morph.viewportHeight = window.innerHeight;
      morph.canvas.width = Math.round(morph.viewportWidth * deviceScale);
      morph.canvas.height = Math.round(morph.viewportHeight * deviceScale);
      morph.context.setTransform(deviceScale, 0, 0, deviceScale, 0, 0);
    }
    morph.width = morph.viewportWidth;
    morph.height = morph.viewportHeight;

    const offscreen = document.createElement("canvas");
    const context = offscreen.getContext("2d", { willReadFrequently: true });
    if (!context) return;
    const glyphs = ".:-=+*#%@";
    const finalGlyphs = "@#%*+";
    const points: MetricPoint[] = [];

    morph.masks.forEach((mask) => {
      const rect = mask.getBoundingClientRect();
      if (rect.width < 4) return;
      const computed = window.getComputedStyle(mask);
      const text = mask.textContent ?? "";
      const accent = mask.querySelector("span");
      const accentText = accent?.textContent ?? "";
      const prefix = accent ? text.slice(0, text.length - accentText.length) : text;

      offscreen.width = Math.ceil(rect.width) + 16;
      offscreen.height = Math.ceil(rect.height) + 16;
      context.font = `${computed.fontWeight} ${Number.parseFloat(computed.fontSize)}px ${computed.fontFamily}`;
      context.textBaseline = "middle";
      context.fillStyle = "#fff";
      context.fillText(text, 4, offscreen.height / 2);
      const prefixWidth = 4 + context.measureText(prefix).width;
      const step = Math.max(4, Math.round(Math.sqrt((rect.width * rect.height) / 230)));
      const image = context.getImageData(0, 0, offscreen.width, offscreen.height).data;
      const raw: Array<[number, number]> = [];
      let minimumY = 1e9;
      let maximumY = -1e9;

      for (let y = 0; y < offscreen.height; y += step) {
        for (let x = 0; x < offscreen.width; x += step) {
          if (image[(y * offscreen.width + x) * 4 + 3] <= 110) continue;
          raw.push([x, y]);
          if (y < minimumY) minimumY = y;
          if (y > maximumY) maximumY = y;
        }
      }

      const verticalShift = rect.height / 2 - (minimumY + maximumY) / 2;
      const baseX = rect.left - sectionRect.left;
      const baseY = rect.top - sectionRect.top;
      raw.forEach(([x, y]) => {
        const random = Math.random();
        points.push({
          rx: baseX + x - 4,
          ry: baseY + y + verticalShift,
          ox: (random - 0.28) * 480,
          oy: -(0.28 + Math.random() * 0.62) * window.innerHeight,
          delay: Math.random() * 0.5,
          glyphIndex: (Math.random() * glyphs.length) | 0,
          finalGlyph: finalGlyphs[(Math.random() * finalGlyphs.length) | 0],
          accent: x > prefixWidth,
        });
      });
      morph.fontSize = step + 3;
    });

    if (points.length) {
      morph.points = points;
      morph.wait = 0;
    }
  }

  private drawMetricMorph(progress: number, sectionRect: DOMRect): void {
    const morph = this.metricMorph;
    if (!morph?.points) return;
    const context = morph.context;
    const glyphs = ".:-=+*#%@";
    context.clearRect(0, 0, morph.width, morph.height);

    if (progress >= 0.999) {
      if (!morph.shown) {
        morph.shown = true;
        morph.masks.forEach((mask, index) => {
          mask.style.opacity = "1";
          mask.animate(
            [
              { transform: "translateY(7px) scale(1.012)" },
              { transform: "translateY(-2px) scale(0.998)", offset: 0.55 },
              { transform: "none" },
            ],
            { duration: 420, delay: index * 55, easing: "cubic-bezier(.22,.9,.3,1)" },
          );
          const accent = mask.querySelector<HTMLElement>("span");
          accent?.animate(
            [
              { textShadow: "0 0 0 rgba(0,168,232,0)" },
              { textShadow: "0 0 26px rgba(0,168,232,.95)", offset: 0.4 },
              { textShadow: "0 0 0 rgba(0,168,232,0)" },
            ],
            { duration: 700, delay: 120 + index * 55, easing: "ease-out" },
          );
        });
        morph.rules.forEach((rule) => {
          rule.style.transform = "scaleX(1)";
        });
      }
      morph.fade = Math.min(1, morph.fade + 0.04);
      if (morph.fade >= 1) {
        morph.canvas.style.display = "none";
        return;
      }
    } else {
      if (morph.canvas.style.display === "none") morph.canvas.style.display = "";
      if (morph.shown && progress < 0.97) {
        morph.shown = false;
        morph.fade = 0;
        morph.masks.forEach((mask) => {
          mask.style.opacity = "0";
        });
        morph.rules.forEach((rule) => {
          rule.style.transform = "scaleX(0)";
        });
      }
    }
    if (progress <= 0.001) return;

    const time = performance.now() / 1000;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = `${morph.fontSize}px "JetBrains Mono", ui-monospace, monospace`;
    const globalAlpha = 1 - morph.fade;

    morph.points.forEach((point) => {
      const amount = this.smoothStep((progress - point.delay) / (1 - point.delay), 0, 1);
      if (amount <= 0.001) return;
      const x = sectionRect.left + point.rx + point.ox * (1 - amount);
      const y = sectionRect.top + point.ry + point.oy * (1 - amount);
      if (y < -24 || y > morph.height + 24) return;
      const glyph = amount > 0.9
        ? point.finalGlyph
        : glyphs[(((time * 8) | 0) + point.glyphIndex) % glyphs.length];
      const alpha = (0.22 + 0.78 * amount) * globalAlpha;
      context.fillStyle = point.accent
        ? `rgba(0,178,240,${alpha.toFixed(3)})`
        : `rgba(232,241,252,${alpha.toFixed(3)})`;
      context.fillText(glyph, x, y);
    });
  }

  private makeServicesVertical(vertical: boolean): void {
    if (vertical === this.verticalServices) return;
    this.verticalServices = vertical;
    const outer = this.el("svcOuter");
    const sticky = this.el("svcSticky");
    const wrapper = this.el("svcWrap");
    const track = this.el("svcTrack");
    const progress = this.el("svcProg");
    if (!outer || !sticky || !wrapper || !track) return;

    if (vertical) {
      this.overrideStyle(outer, "height", "auto");
      this.overrideStyle(sticky, "position", "relative");
      this.overrideStyle(sticky, "height", "auto");
      this.overrideStyle(sticky, "overflow", "visible");
      this.overrideStyle(wrapper, "overflow", "visible");
      this.overrideStyle(wrapper, "display", "block");
      this.overrideStyle(track, "transform", "none");
      this.overrideStyle(track, "flexDirection", "column");
      this.overrideStyle(track, "gap", "110px");
      this.overrideStyle(track, "alignItems", "stretch");
      this.overrideStyle(track, "padding", "50px clamp(20px,5vw,72px) 90px");
      this.overrideStyle(track, "width", "auto");
      this.overrideStyle(track, "boxSizing", "border-box");
      this.overrideStyle(track, "display", "flex");
      if (progress) this.overrideStyle(progress, "display", "none");
      this.query<HTMLElement>("[data-px-scene]").forEach((scene) => {
        this.overrideStyle(scene, "width", "100%");
        this.overrideStyle(scene, "boxSizing", "border-box");
        this.overrideStyle(scene, "gridTemplateColumns", "1fr");
        this.overrideStyle(scene, "overflow", "hidden");
      });
    } else {
      this.resetStyles(outer);
      this.resetStyles(sticky);
      this.resetStyles(wrapper);
      this.resetStyles(track);
      this.resetStyles(progress);
      this.query<HTMLElement>("[data-px-scene]").forEach((scene) => this.resetStyles(scene));
      this.serviceProgress = null;
    }
  }

  private applyLayout(): void {
    const narrow = this.narrowQuery.matches;
    if (narrow === this.narrow && this.layoutInitialized) return;
    this.layoutInitialized = true;
    this.narrow = narrow;

    const navigation = this.el("navLinks");
    const menuButton = this.root.querySelector<HTMLElement>(
      '[data-menu-toggle], [data-px="menuBtn"]',
    );
    if (navigation) navigation.style.display = narrow ? "none" : "flex";
    if (menuButton) menuButton.style.display = narrow ? "flex" : "none";
    if (!narrow && this.menuOpen) this.setMenuOpen(false);

    const stackRight = this.el("stackRight");
    if (stackRight) narrow ? this.overrideStyle(stackRight, "paddingTop", "0") : this.resetStyles(stackRight);

    this.query<HTMLElement>("[data-mcell]").forEach((cell) => {
      narrow ? this.overrideStyle(cell, "borderLeft", "none") : this.resetStyles(cell);
    });
    const metricsGrid = this.el("metricsGrid");
    if (metricsGrid) {
      Array.from(metricsGrid.children).forEach((child) => {
        if (!(child instanceof HTMLElement)) return;
        narrow ? this.overrideStyle(child, "padding", "34px 26px 30px") : this.resetStyles(child);
      });
    }

    this.query<HTMLElement>("[data-px-art]").forEach((art) => {
      if (!narrow) {
        this.resetStyles(art);
        return;
      }
      if (art.getAttribute("data-px-art") === "ai") {
        this.overrideStyle(art, "height", "auto");
        this.overrideStyle(art, "flexDirection", "column");
        this.overrideStyle(art, "alignItems", "stretch");
        this.overrideStyle(art, "gap", "18px");
      } else {
        this.overrideStyle(art, "height", "340px");
      }
    });

    this.query<HTMLElement>("[data-px-ainames]").forEach((names) => {
      Array.from(names.children).forEach((child) => {
        if (!(child instanceof HTMLElement)) return;
        narrow ? this.overrideStyle(child, "whiteSpace", "normal") : this.resetStyles(child);
      });
    });
    const aiFlow = this.query<HTMLElement>("[data-px-aiflow]")[0];
    if (aiFlow) {
      if (narrow) {
        this.overrideStyle(aiFlow, "flexDirection", "row");
        this.overrideStyle(aiFlow, "alignSelf", "center");
      } else {
        this.resetStyles(aiFlow);
      }
    }
    this.query<HTMLElement>("[data-px-aibar]").forEach((bar) => {
      if (narrow) {
        this.overrideStyle(bar, "height", "1px");
        this.overrideStyle(bar, "width", "54px");
      } else {
        this.resetStyles(bar);
      }
    });

    const cloudHorizontal = this.el("cloudH");
    const cloudVertical = this.el("cloudV");
    const cloudArt = this.el("cloudArt");
    if (cloudHorizontal && cloudVertical) {
      if (narrow) {
        this.overrideStyle(cloudHorizontal, "display", "none");
        this.overrideStyle(cloudVertical, "display", "block");
        if (cloudArt) {
          this.overrideStyle(cloudArt, "maxHeight", "none");
          this.overrideStyle(cloudArt, "height", "auto");
        }
      } else {
        this.resetStyles(cloudHorizontal);
        this.resetStyles(cloudVertical);
        this.resetStyles(cloudArt);
      }
    }

    this.query<HTMLElement>("[data-px-num]").forEach((number) => {
      if (narrow) {
        this.overrideStyle(number, "fontSize", "110px");
        this.overrideStyle(number, "top", "0px");
        this.overrideStyle(number, "color", "rgba(244,247,253,.05)");
        if (number.getAttribute("data-px-num") === "r") this.overrideStyle(number, "right", "0");
        else this.overrideStyle(number, "left", "0");
      } else {
        this.resetStyles(number);
      }
    });

    const watermark = this.el("wm");
    if (watermark) {
      if (narrow) {
        this.overrideStyle(watermark, "fontSize", "22vw");
        this.overrideStyle(watermark, "bottom", "-2vw");
      } else {
        this.resetStyles(watermark);
      }
    }

    const heroText = this.el("heroText");
    const laptopWrapper = this.el("lapWrap");
    if (narrow) {
      if (laptopWrapper) {
        this.overrideStyle(laptopWrapper, "width", "100vw");
        this.overrideStyle(laptopWrapper, "right", "0");
        this.overrideStyle(laptopWrapper, "opacity", "0.24");
      }
    } else {
      this.resetStyles(laptopWrapper);
      this.resetStyles(heroText);
    }

    ["stackGrid", "contactGrid", "outGrid", "storyGrid"].forEach((name) => {
      const grid = this.el(name);
      if (!grid) return;
      narrow ? this.overrideStyle(grid, "gridTemplateColumns", "1fr") : this.resetStyles(grid);
    });
    if (metricsGrid) {
      narrow
        ? this.overrideStyle(metricsGrid, "gridTemplateColumns", "1fr 1fr")
        : this.resetStyles(metricsGrid);
    }

    this.makeServicesVertical(narrow || this.reduced);
  }

  private applyReducedMotion(): void {
    this.query<HTMLElement>("[data-af]").forEach((element) => {
      element.style.animation = "none";
    });
    this.query<HTMLElement>("[data-anim]").forEach((element) => {
      element.style.animation = "none";
      element.style.opacity = "1";
      element.style.transform = "none";
    });
    this.query<HTMLElement>("[data-tick]").forEach((ticker) => {
      ticker.style.animationPlayState = "paused";
    });
    this.pixelCells.forEach((cell) => {
      cell.style.transition = "none";
      cell.style.opacity = "1";
      cell.active = true;
    });
    this.query<HTMLElement>("[data-px-band]").forEach((band) => {
      band.style.transition = "none";
      band.style.transform = "translateX(0%)";
    });

    const iris = this.el("iris");
    if (iris) iris.style.clipPath = "circle(160% at 50% 100%)";
    const strike = this.el("strike");
    if (strike) {
      strike.style.transition = "none";
      strike.style.width = "100%";
    }
    const name = this.el("pixName");
    if (name) {
      name.style.transition = "none";
      name.style.opacity = "1";
      name.style.transform = "none";
    }
    const timeline = this.el("tline");
    if (timeline) {
      timeline.style.transition = "none";
      timeline.style.transform = "scaleY(1)";
    }
    const hint = this.el("scrollHint");
    if (hint) hint.style.display = "none";
  }

  private shuffle(element: HTMLElement, finalText: string, duration: number): void {
    const characters = "<>/[]{}=+*#%@01";
    const start = performance.now();
    const step = (now: number): void => {
      if (this.destroyed) {
        element.textContent = finalText;
        return;
      }
      const progress = Math.min(1, (now - start) / duration);
      let text = "";
      for (let index = 0; index < finalText.length; index += 1) {
        text += index / finalText.length < progress * 1.2
          ? finalText[index]
          : characters[(Math.random() * characters.length) | 0];
      }
      element.textContent = text;
      if (progress < 1) window.requestAnimationFrame(step);
      else element.textContent = finalText;
    };
    window.requestAnimationFrame(step);
  }
}

declare global {
  interface Window {
    __pixegonSiteController?: SiteController;
  }
}

export function initSiteController(
  root: HTMLElement | null = document.querySelector<HTMLElement>(
    '[data-site-root], [data-px="root"], #top',
  ),
  options: SiteControllerOptions = {},
): SiteController | null {
  if (!root) return null;
  const current = window.__pixegonSiteController;
  if (current && current.root === root) return current.mount();
  current?.destroy();
  const controller = new SiteController(root, options);
  controller.mount();
  window.__pixegonSiteController = controller;
  return controller;
}

export function destroySiteController(): void {
  window.__pixegonSiteController?.destroy();
  delete window.__pixegonSiteController;
}

export default SiteController;
