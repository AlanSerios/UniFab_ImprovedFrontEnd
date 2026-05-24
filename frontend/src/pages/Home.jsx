import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  Boxes,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Library,
  MapPin,
  Pause,
  Play,
  UploadCloud,
} from "lucide-react";
import { Link } from "react-router-dom";
import { API_BASE_URL } from "../api/client";
import { getActiveMaterials } from "../api/materials";
import { useAuth } from "../context/AuthContext";

const API_ORIGIN = API_BASE_URL.replace(/\/api\/v1\/?$/, "");
const LANDING_VIDEO_PLACEHOLDER = `${API_ORIGIN}/storage/website-content/landing/videos/black-screen-5s.mp4`;

const WORKFLOW_STEPS = [
  {
    title: "Design",
    description: "Upload a model or start from a UniFab-hosted design.",
  },
  {
    title: "Quote",
    description: "Generate slicer-backed cost, time, and material estimates.",
  },
  {
    title: "Submit",
    description: "Create a request from a valid quote or cart draft.",
  },
  {
    title: "Pay",
    description: "Use the payment slip and verify the receipt in person.",
  },
  {
    title: "Track",
    description: "Follow the request timeline until completion.",
  },
];

const FEATURE_VIDEOS = [
  {
    title: "Instant Quote",
    label: "Quote preview",
    description:
      "Upload a supported model, choose print settings, and preview slicer-backed cost and time estimates before signing in.",
    to: "/quote",
    cta: "Start a quote",
    icon: UploadCloud,
    tone: "quote",
    videoSrc: LANDING_VIDEO_PLACEHOLDER,
  },
  {
    title: "Design Library",
    label: "Library discovery",
    description:
      "Browse UniFab-hosted, community, official lab, and external reference designs with clear readiness labels.",
    to: "/designs",
    cta: "Browse designs",
    icon: Library,
    tone: "library",
    videoSrc: LANDING_VIDEO_PLACEHOLDER,
  },
  {
    title: "Print Request Tracking",
    label: "Request timeline",
    description:
      "Follow submitted requests through payment, receipt verification, printing, and completion from one workflow.",
    to: "/requests",
    cta: "Track requests",
    icon: ClipboardCheck,
    tone: "tracking",
    videoSrc: LANDING_VIDEO_PLACEHOLDER,
  },
];

const FEATURED_DESIGNS = [
  {
    title: "Adjustable Phone Stand",
    category: "Print Ready",
    source: "Official Lab",
    detail: "A practical desk accessory prepared for quick classroom and office prints.",
    readiness: "Instant quote available",
    marker: "STAND",
    tags: ["Print Ready", "Desk", "Utility"],
    isPrintReady: true,
    preview: "stand",
    previewSrc: "",
    previewAlt: "Adjustable phone stand design preview",
  },
  {
    title: "Cable Label Set",
    category: "Featured",
    source: "Community",
    detail: "Small utility tags for organizing lab benches, project bins, and electronics kits.",
    readiness: "View design details",
    marker: "LABEL",
    tags: ["Featured", "Organizer", "Community"],
    isPrintReady: false,
    preview: "labels",
    previewSrc: "",
    previewAlt: "Cable label set design preview",
  },
  {
    title: "Workshop Fixture Block",
    category: "Official Lab",
    source: "UniFab Designs",
    detail: "A sample fixture concept for demonstrating fit checks and print orientation.",
    readiness: "Admin selected",
    marker: "BLOCK",
    tags: ["Official Lab", "Fixture", "Workshop"],
    isPrintReady: false,
    preview: "fixture",
    previewSrc: "",
    previewAlt: "Workshop fixture block design preview",
  },
];

const LAB_DIRECTIONS_URL =
  "https://maps.app.goo.gl/FFrJ6RHdKjqijVaB7";

const LAB_LOCATION_IMAGE = {
  src: "",
  alt: "USTP-CDO Fabrication Laboratory location photo",
};

const FAQ_ITEMS = [
  {
    id: "guest-quotes",
    question: "Can guests preview a quote before creating an account?",
    answer:
      "Yes. Guests can upload supported files and preview calculated quote details. Login with verified email is required only for cart and print request submission.",
  },
  {
    id: "supported-files",
    question: "Which files can be used for quote previews?",
    answer:
      "The quote workflow supports STL, OBJ, and 3MF uploads, with backend slicing used for print time, material use, and pricing.",
  },
  {
    id: "print-ready",
    question: "What does Print Ready mean in the Design Library?",
    answer:
      "Print Ready means a specific design file has passed FabLab file-level review and can be used for instant quote actions.",
  },
  {
    id: "quote-failures",
    question: "What happens when a quote cannot be generated?",
    answer:
      "UniFab shows specific slicer or readiness feedback where available, such as unsupported files, missing profiles, or model constraints.",
  },
  {
    id: "payment-tracking",
    question: "How do payment slips and request tracking work?",
    answer:
      "The backend generates payment slips for submitted requests. Lab admins verify physical receipts in person, then clients can follow the request timeline.",
  },
];

const DEFAULT_MATERIAL_CHIPS = [
  "Backend materials",
  "Managed profiles",
  "Slicer diagnostics",
  "Quote readiness",
];

function getFirstName(name) {
  return String(name || "").trim().split(/\s+/)[0] || "";
}

export default function Home() {
  const { user, isAuthenticated } = useAuth();
  const [materials, setMaterials] = useState([]);
  const [materialStatus, setMaterialStatus] = useState("loading");
  const [mascotState, setMascotState] = useState("happy");
  const [activeVideoIndex, setActiveVideoIndex] = useState(0);
  const [activeDesignIndex, setActiveDesignIndex] = useState(0);
  const [isDesignCarouselPaused, setIsDesignCarouselPaused] = useState(false);
  const [designTouchStart, setDesignTouchStart] = useState(null);
  const [designTouchEnd, setDesignTouchEnd] = useState(null);
  const [openFaqId, setOpenFaqId] = useState(FAQ_ITEMS[0].id);

  useEffect(() => {
    let isMounted = true;

    async function loadMaterials() {
      try {
        const data = await getActiveMaterials();
        const activeMaterials = data.data?.materials || data.materials || [];

        if (!isMounted) return;

        setMaterials(activeMaterials);
        setMaterialStatus("ready");
      } catch {
        if (!isMounted) return;

        setMaterials([]);
        setMaterialStatus("fallback");
      }
    }

    loadMaterials();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (mascotState === "blank") return undefined;

    const timer = window.setTimeout(() => setMascotState("blank"), 1800);

    return () => window.clearTimeout(timer);
  }, [mascotState]);

  useEffect(() => {
    if (isDesignCarouselPaused || FEATURED_DESIGNS.length < 2) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      setActiveDesignIndex((current) => (current + 1) % FEATURED_DESIGNS.length);
    }, 5000);

    return () => window.clearInterval(interval);
  }, [isDesignCarouselPaused]);

  const materialChips = useMemo(() => {
    if (materials.length === 0) {
      return DEFAULT_MATERIAL_CHIPS;
    }

    return materials
      .slice(0, 6)
      .map(
        (material) =>
          material.displayName ||
          material.name ||
          material.materialKey ||
          "Material",
      );
  }, [materials]);

  const firstName = getFirstName(user?.name);
  const greeting = isAuthenticated
    ? `Welcome back${firstName ? `, ${firstName}` : ""}`
    : "Welcome to UniFab";

  const showPreviousDesign = () => {
    setActiveDesignIndex(
      (current) => (current - 1 + FEATURED_DESIGNS.length) % FEATURED_DESIGNS.length,
    );
  };

  const showNextDesign = () => {
    setActiveDesignIndex((current) => (current + 1) % FEATURED_DESIGNS.length);
  };

  const getDesignCarouselPosition = (index) => {
    if (index === activeDesignIndex) return "is-active";

    if (index === (activeDesignIndex + 1) % FEATURED_DESIGNS.length) {
      return "is-next";
    }

    if (
      index ===
      (activeDesignIndex - 1 + FEATURED_DESIGNS.length) % FEATURED_DESIGNS.length
    ) {
      return "is-previous";
    }

    return "is-hidden";
  };

  const handleDesignTouchEnd = () => {
    if (designTouchStart === null || designTouchEnd === null) return;

    const distance = designTouchStart - designTouchEnd;

    if (distance > 48) {
      showNextDesign();
    } else if (distance < -48) {
      showPreviousDesign();
    }

    setDesignTouchStart(null);
    setDesignTouchEnd(null);
  };

  return (
    <main className="unifab-home">
      <div className="unifab-home__texture" aria-hidden="true" />

      <section className="unifab-home__material-bar" aria-label="Quote support">
        <div className="unifab-home__shell unifab-home__material-inner">
          {materialChips.map((chip) => (
            <Link key={chip} to="/quote">
              {chip}
            </Link>
          ))}
        </div>
      </section>

      <section className="unifab-home__hero">
        <div className="unifab-home__shell">
          <div className="unifab-home__welcome">
            <span aria-hidden="true" />
            <h1>{greeting}</h1>
            <span
              className={`unifab-home__mascot is-${mascotState}`}
              aria-label="UniFab assistant mascot"
            >
              <img
                className="unifab-home__mascot-state unifab-home__mascot-state--happy"
                src="/assets/mascot/mascot-happy.svg"
                alt="UniFab assistant mascot"
              />
              <img
                className="unifab-home__mascot-state unifab-home__mascot-state--blank"
                src="/assets/mascot/mascot-blank.svg"
                alt=""
                aria-hidden="true"
              />
              <img
                className="unifab-home__mascot-state unifab-home__mascot-state--serious"
                src="/assets/mascot/mascot-serious.svg"
                alt=""
                aria-hidden="true"
              />
            </span>
            <span aria-hidden="true" />
          </div>

          <div className="unifab-home__hero-card">
            <div className="unifab-home__hero-copy">
              <p className="unifab-home__eyebrow">
                USTP-CDO Fabrication Laboratory
              </p>
              <h2>Get a slicer-backed 3D print quote</h2>
              <p>
                Upload a supported model, choose material settings, and review
                the quote before deciding whether to submit a print request.
              </p>
              <div className="unifab-home__hero-actions">
                <Link
                  className="unifab-home__button unifab-home__button--primary"
                  to="/quote"
                  onMouseEnter={() => setMascotState("happy")}
                  onFocus={() => setMascotState("happy")}
                >
                  Start a quote
                  <ArrowRight aria-hidden="true" />
                </Link>
                <Link
                  className="unifab-home__button unifab-home__button--secondary"
                  to="/designs"
                >
                  Browse designs
                </Link>
              </div>
            </div>

            <Link
              className="unifab-home__upload-zone"
              to="/quote"
              onMouseEnter={() => setMascotState("happy")}
              onFocus={() => setMascotState("happy")}
            >
              <span className="unifab-home__upload-icon" aria-hidden="true">
                <UploadCloud />
              </span>
              <strong>Upload for quote</strong>
              <span>
                The actual quote workflow runs on the backend with managed
                material, color, quality, infill, and quantity controls.
              </span>
            </Link>
          </div>

          <ol className="unifab-home__workflow" aria-label="UniFab workflow">
            {WORKFLOW_STEPS.map((step, index) => (
              <li key={step.title}>
                <span>{index + 1}</span>
                <strong>{step.title}</strong>
                <p>{step.description}</p>
              </li>
            ))}
          </ol>

          <div className="unifab-home__notice" role="note">
            <BadgeCheck aria-hidden="true" />
            <p>
              <strong>Guest quote preview stays open.</strong> Verified email
              access is required only when adding quotes to cart or submitting a
              print request for FabLab review.
            </p>
          </div>
        </div>
      </section>

      <section className="unifab-home__section unifab-home__shell unifab-home__videos">
        <div className="unifab-home__section-heading">
          <div>
            <p className="unifab-home__eyebrow">Feature previews</p>
            <h2>See the service path before you start</h2>
          </div>
          <p>
            Short demo slots will showcase the core UniFab workflow. For now,
            each panel uses the shared backend-managed placeholder video.
          </p>
        </div>

        <div className="unifab-home__video-grid" aria-label="UniFab feature videos">
          {FEATURE_VIDEOS.map((card, index) => {
            const Icon = card.icon;
            const isActive = activeVideoIndex === index;

            return (
              <article
                className={`unifab-home__video-card ${isActive ? "is-active" : ""}`}
                key={card.title}
                onMouseEnter={() => setActiveVideoIndex(index)}
              >
                <button
                  type="button"
                  className="unifab-home__video-select"
                  onClick={() => setActiveVideoIndex(index)}
                  onFocus={() => setActiveVideoIndex(index)}
                  aria-pressed={isActive}
                >
                  <span className="unifab-home__video-frame">
                    <span
                      className={`unifab-home__video-poster is-${card.tone}`}
                      aria-hidden="true"
                    >
                      <span />
                      <span />
                      <span />
                    </span>
                    <video
                      src={card.videoSrc}
                      autoPlay
                      muted
                      loop
                      playsInline
                      preload="metadata"
                      aria-label={`${card.title} placeholder preview`}
                    />
                    <span className="unifab-home__video-scrim" aria-hidden="true" />
                    <span className="unifab-home__video-overlay">
                      <span className="unifab-home__video-icon" aria-hidden="true">
                        <Icon />
                      </span>
                      <span className="unifab-home__video-state">
                        {isActive ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
                        {isActive ? "Selected preview" : "Select preview"}
                      </span>
                    </span>
                    <span className="unifab-home__video-copy">
                      <span>{card.label}</span>
                      <strong>{card.title}</strong>
                      <span>{card.description}</span>
                    </span>
                  </span>
                </button>
                <Link className="unifab-home__video-cta" to={card.to}>
                  {card.cta}
                </Link>
              </article>
            );
          })}
        </div>
      </section>

      <section className="unifab-home__section unifab-home__shell unifab-home__featured">
        <div className="unifab-home__section-heading">
          <div>
            <p className="unifab-home__eyebrow">Featured Library Designs</p>
            <h2>Selected designs from the UniFab library</h2>
          </div>
          <Link to="/designs">Browse all designs</Link>
        </div>

        <div
          className="unifab-home__design-carousel"
          aria-label="Featured library design carousel"
          onMouseEnter={() => setIsDesignCarouselPaused(true)}
          onMouseLeave={() => setIsDesignCarouselPaused(false)}
          onFocus={() => setIsDesignCarouselPaused(true)}
          onBlur={() => setIsDesignCarouselPaused(false)}
          onTouchStart={(event) => {
            setDesignTouchStart(event.targetTouches[0].clientX);
            setDesignTouchEnd(null);
          }}
          onTouchMove={(event) => setDesignTouchEnd(event.targetTouches[0].clientX)}
          onTouchEnd={handleDesignTouchEnd}
        >
          <button
            type="button"
            className="unifab-home__carousel-control unifab-home__carousel-control--previous"
            onClick={showPreviousDesign}
            aria-label="Previous featured design"
          >
            <ChevronLeft aria-hidden="true" />
          </button>

          <div className="unifab-home__design-stage">
            {FEATURED_DESIGNS.map((card, index) => (
              <article
                className={[
                  "unifab-home__featured-design",
                  card.isPrintReady ? "is-print-ready" : "",
                  getDesignCarouselPosition(index),
                ]
                  .filter(Boolean)
                  .join(" ")}
                key={card.title}
                aria-hidden={index !== activeDesignIndex}
              >
                <div
                  className={`unifab-home__featured-visual is-${card.preview}`}
                  aria-hidden={card.previewSrc ? undefined : "true"}
                >
                  {card.previewSrc ? (
                    <img src={card.previewSrc} alt={card.previewAlt} loading="lazy" />
                  ) : (
                    <div className="unifab-home__design-model" aria-hidden="true">
                      <span />
                      <span />
                      <span />
                    </div>
                  )}
                  <span className="unifab-home__featured-marker">{card.marker}</span>
                  <span className="unifab-home__featured-type-icon">
                    {index === 0 ? <BadgeCheck /> : index === 1 ? <Boxes /> : <Library />}
                  </span>
                </div>
                <div className="unifab-home__featured-copy">
                  <p>{card.category}</p>
                  <span>{card.source}</span>
                </div>
                <h3>{card.title}</h3>
                <p>{card.detail}</p>
                <div className="unifab-home__featured-tags" aria-label={`${card.title} labels`}>
                  {card.tags.map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
                <div className="unifab-home__featured-footer">
                  <span>{card.readiness}</span>
                  <div>
                    <Link
                      to="/designs"
                      tabIndex={index === activeDesignIndex ? undefined : -1}
                    >
                      View design
                    </Link>
                    {card.isPrintReady && (
                      <Link
                        to="/quote"
                        tabIndex={index === activeDesignIndex ? undefined : -1}
                      >
                        Instant quote
                      </Link>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>

          <button
            type="button"
            className="unifab-home__carousel-control unifab-home__carousel-control--next"
            onClick={showNextDesign}
            aria-label="Next featured design"
          >
            <ChevronRight aria-hidden="true" />
          </button>

          <div className="unifab-home__carousel-dots" aria-label="Featured design slides">
            {FEATURED_DESIGNS.map((card, index) => (
              <button
                type="button"
                key={card.title}
                className={index === activeDesignIndex ? "is-active" : ""}
                onClick={() => setActiveDesignIndex(index)}
                aria-label={`Show ${card.title}`}
                aria-current={index === activeDesignIndex ? "true" : undefined}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="unifab-home__start unifab-home__shell">
        <div className="unifab-home__start-panel">
          <div>
            <p className="unifab-home__eyebrow">Start with a quote</p>
            <h2>Start with a quote. Submit when the details are ready.</h2>
            <p>
              Preview first, compare settings, then submit only when the file,
              material, quantity, and request details are ready for FabLab review.
            </p>
          </div>
          <div className="unifab-home__start-actions">
            <Link className="unifab-home__button unifab-home__button--primary" to="/quote">
              <UploadCloud aria-hidden="true" />
              Start a quote
            </Link>
            <Link
              className="unifab-home__button unifab-home__button--secondary"
              to="/designs"
            >
              Browse Print Ready designs
            </Link>
            <p>
              Guest quote preview remains available. Verified email is required
              when a quote becomes a cart item or submitted print request.
            </p>
          </div>
        </div>
      </section>

      <section className="unifab-home__info unifab-home__shell">
        <div className="unifab-home__info-panel">
          <div className="unifab-home__location-copy">
            <p className="unifab-home__eyebrow">FabLab location</p>
            <h2>Where We Are Located</h2>
            <p>
              Visit the USTP-CDO Fabrication Laboratory for 3D printing and
              fabrication services.
            </p>
            <div className="unifab-home__address">
              <span>Address</span>
              <strong>
                University of Science and Technology of Southern Philippines
              </strong>
              <p>Cagayan de Oro City</p>
            </div>
            <div className="unifab-home__location-actions">
              <a
                className="unifab-home__button unifab-home__button--primary"
                href={LAB_DIRECTIONS_URL}
                target="_blank"
                rel="noreferrer"
              >
                Get Directions
              </a>
              <Link className="unifab-home__button unifab-home__button--secondary" to="/about">
                Contact Us
              </Link>
            </div>
          </div>

          <div className="unifab-home__map-panel" aria-label="USTP-CDO FabLab location image">
            {LAB_LOCATION_IMAGE.src ? (
              <img
                src={LAB_LOCATION_IMAGE.src}
                alt={LAB_LOCATION_IMAGE.alt}
                loading="lazy"
              />
            ) : (
              <div
                className="unifab-home__location-image-placeholder"
                role="img"
                aria-label="Placeholder for the USTP-CDO FabLab location photo"
              >
                <MapPin aria-hidden="true" />
                <span>FabLab location image</span>
                <p>Placeholder for admin-managed landing content.</p>
              </div>
            )}
            <div className="unifab-home__map-card">
              <span>
                <MapPin aria-hidden="true" />
                USTP-CDO FabLab
              </span>
              <strong>Fabrication Laboratory</strong>
              <p>3D printing and campus fabrication support.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="unifab-home__faq unifab-home__shell">
        <div className="unifab-home__section-heading">
          <div>
            <p className="unifab-home__eyebrow">Before you submit</p>
            <h2>Common questions about UniFab requests</h2>
          </div>
        </div>

        <div className="unifab-home__faq-list">
          {FAQ_ITEMS.map((item) => {
            const isOpen = openFaqId === item.id;

            return (
              <div className="unifab-home__faq-item" key={item.id}>
                <button
                  type="button"
                  onClick={() => setOpenFaqId(isOpen ? "" : item.id)}
                  aria-expanded={isOpen}
                >
                  <span>{item.question}</span>
                  <ChevronDown aria-hidden="true" />
                </button>
                <div hidden={!isOpen}>
                  <p>{item.answer}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <p className="sr-only" aria-live="polite">
        {materialStatus === "loading"
          ? "Loading active materials."
          : materialStatus === "ready"
            ? "Active material shortcuts loaded."
            : "Material shortcuts are showing general quote support links."}
      </p>
    </main>
  );
}
