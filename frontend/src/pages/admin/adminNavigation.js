export const ADMIN_NAV_GROUPS = [
  {
    title: "Operations",
    items: [
      {
        to: "/admin",
        title: "Overview",
        description: "Queues and health signals",
        end: true,
      },
      {
        to: "/admin/print-requests",
        title: "Print Requests",
        description: "Submission and payment flow",
        match: ["/admin/print-requests"],
      },
      {
        to: "/admin/users",
        title: "Users",
        description: "Roles and verification",
        match: ["/admin/users"],
      },
    ],
  },
  {
    title: "Design Library",
    items: [
      {
        to: "/admin/lab-designs",
        title: "Lab Designs",
        description: "Official UniFab catalog",
        match: ["/admin/lab-designs", "/admin/local-designs"],
      },
      {
        to: "/admin/community-designs",
        title: "Community Review",
        description: "Moderation queue",
        match: ["/admin/community-designs"],
      },
      {
        to: "/admin/mmf-overrides",
        title: "MMF Readiness",
        description: "External design controls",
        match: ["/admin/mmf-overrides"],
      },
      {
        to: "/admin/design-taxonomy",
        title: "Taxonomy",
        description: "Categories and tags",
        match: ["/admin/design-taxonomy"],
      },
    ],
  },
  {
    title: "Configuration",
    items: [
      {
        to: "/admin/materials",
        title: "Materials",
        description: "Printable material setup",
        match: ["/admin/materials"],
      },
      {
        to: "/admin/slicer-profiles",
        title: "Slicer Profiles",
        description: "Profile validation",
        match: ["/admin/slicer-profiles"],
      },
      {
        to: "/admin/quote-readiness",
        title: "Quote Readiness",
        description: "Diagnostics and blockers",
        match: ["/admin/quote-readiness"],
      },
      {
        to: "/admin/pricing",
        title: "Pricing",
        description: "Rates and markup",
        match: ["/admin/pricing"],
      },
      {
        to: "/admin/printers",
        title: "Printers",
        description: "Public printer info",
        match: ["/admin/printers"],
      },
    ],
  },
  {
    title: "System",
    items: [
      {
        to: "/admin/status",
        title: "Status",
        description: "API and database health",
        match: ["/admin/status"],
      },
      {
        to: "/admin/maintenance",
        title: "Maintenance",
        description: "Retention and file cleanup",
        match: ["/admin/maintenance"],
      },
      {
        to: "/admin/content",
        title: "Website Content",
        description: "Public copy and notices",
        match: ["/admin/content"],
      },
      {
        to: "/admin/audit",
        title: "Audit Log",
        description: "Admin activity",
        match: ["/admin/audit"],
      },
    ],
  },
];

export function getAdminNavItems() {
  return ADMIN_NAV_GROUPS.flatMap((group) => group.items);
}
