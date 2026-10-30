/** A built-in stock photo, sized for the slot it fills. */
export const img = (id, w = 800) =>
  `https://images.unsplash.com/${id}?q=80&w=${w}&auto=format&fit=crop`;
