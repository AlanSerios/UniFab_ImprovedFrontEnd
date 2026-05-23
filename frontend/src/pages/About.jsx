import { Link } from "react-router-dom";

const workflowCards = [
  {
    kicker: "Quote",
    title: "Slicer-backed estimates",
    body: "Guests can upload supported models, configure material settings, and review calculated print time, filament use, and pricing before deciding whether to continue.",
  },
  {
    kicker: "Request",
    title: "Verified submission",
    body: "Print requests require a verified account, accepted Terms and Conditions, and a final confirmation that preserves the quote, material, quality, and request details.",
  },
  {
    kicker: "Payment",
    title: "Receipt checked in person",
    body: "UniFab generates branded PDF payment slips. Lab administrators verify physical receipts in person and keep the request timeline auditable.",
  },
];

const serviceCards = [
  {
    kicker: "Library",
    title: "Design discovery",
    body: "The Design Library separates Featured, Print Ready, Official Lab, Community, and external MyMiniFactory references so clients can understand what can be browsed, downloaded, saved, or quoted instantly.",
  },
  {
    kicker: "Readiness",
    title: "Print Ready is separate",
    body: "Public approval does not automatically make a design ready for instant quoting. Print Ready status is reviewed per file by administrators using lab-managed slicer verification.",
  },
  {
    kicker: "Printers",
    title: "Information only",
    body: "Printer information helps clients understand lab capabilities, but printer selection does not affect quote generation or request submission in the current workflow.",
  },
];

export default function About() {
  return (
    <main className="unifab-about">
      <section className="unifab-app__shell unifab-about__hero">
        <div>
          <p className="unifab-about__eyebrow">USTP-CDO Fabrication Laboratory</p>
          <h1>Campus fabrication support, from quote to request tracking.</h1>
          <p className="unifab-about__lead">
            UniFab is the university 3D printing service web app for the
            USTP-CDO Fabrication Laboratory. It keeps quote review public,
            request submission verified, and lab operations managed by admins.
          </p>
          <div className="unifab-about__hero-actions">
            <Link className="unifab-about__button unifab-about__button--primary" to="/quote">
              Start a quote
            </Link>
            <Link className="unifab-about__button" to="/designs">
              Explore designs
            </Link>
          </div>
        </div>

        <aside className="unifab-about__panel" aria-label="UniFab service summary">
          <p className="unifab-about__card-kicker">How UniFab works</p>
          <h2>Public quotes, verified requests, admin-managed service data.</h2>
          <p>
            Materials, pricing, slicer profiles, printer records, design
            readiness, and request status changes stay controlled by the lab so
            each submitted request keeps a traceable snapshot.
          </p>
          <div className="unifab-about__stats" aria-label="Service areas">
            <span>
              Quote
              <small>Preview first</small>
            </span>
            <span>
              Request
              <small>Verify account</small>
            </span>
            <span>
              Track
              <small>Follow status</small>
            </span>
          </div>
        </aside>
      </section>

      <section className="unifab-app__shell unifab-about__section">
        <p className="unifab-about__section-kicker">Workflow</p>
        <h2>Designed around review before submission.</h2>
        <div className="unifab-about__grid">
          {workflowCards.map((card) => (
            <article className="unifab-about__card" key={card.title}>
              <p className="unifab-about__card-kicker">{card.kicker}</p>
              <h3>{card.title}</h3>
              <p>{card.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="unifab-app__shell unifab-about__section">
        <p className="unifab-about__section-kicker">FabLab context</p>
        <h2>Discovery and lab readiness stay clearly separated.</h2>
        <div className="unifab-about__grid">
          {serviceCards.map((card) => (
            <article className="unifab-about__card" key={card.title}>
              <p className="unifab-about__card-kicker">{card.kicker}</p>
              <h3>{card.title}</h3>
              <p>{card.body}</p>
            </article>
          ))}
        </div>
        <div className="unifab-about__note">
          <p>
            Terms acceptance is required before final request submission, and
            backend-generated payment slips support the in-person cashier and
            receipt verification workflow.
          </p>
          <Link className="unifab-about__button" to="/terms">
            Read terms
          </Link>
        </div>
      </section>
    </main>
  );
}
