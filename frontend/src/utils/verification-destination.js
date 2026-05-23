const PENDING_DESTINATION_KEY = "unifab.pendingVerifiedDestination";

function getSafeDestination(destination) {
  if (!destination || typeof destination !== "string") {
    return "/dashboard";
  }

  if (!destination.startsWith("/") || destination.startsWith("//")) {
    return "/dashboard";
  }

  if (
    destination.startsWith("/login") ||
    destination.startsWith("/register") ||
    destination.startsWith("/verify-required") ||
    destination.startsWith("/verify-email")
  ) {
    return "/dashboard";
  }

  return destination;
}

export function rememberVerifiedDestination(destination) {
  const safeDestination = getSafeDestination(destination);

  try {
    window.sessionStorage.setItem(PENDING_DESTINATION_KEY, safeDestination);
  } catch {
    // Ignore storage failures; route state still carries the destination.
  }

  return safeDestination;
}

export function consumeVerifiedDestination(fallback = "/dashboard") {
  try {
    const destination = window.sessionStorage.getItem(PENDING_DESTINATION_KEY);
    window.sessionStorage.removeItem(PENDING_DESTINATION_KEY);

    return getSafeDestination(destination || fallback);
  } catch {
    return getSafeDestination(fallback);
  }
}

export { getSafeDestination };
