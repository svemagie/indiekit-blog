import { mf2 } from "microformats-parser";

/**
 * Get profile information from h-card on user's site
 * @param {string} me - User's profile URL
 * @returns {Promise<object|undefined>} Profile information (name, url, photo)
 * @see {@link https://indieauth.spec.indieweb.org/#profile-information}
 */
export const getProfileInformation = async (me) => {
  try {
    const response = await fetch(me);
    if (!response.ok) {
      return;
    }

    const body = await response.text();
    const { items } = mf2(body, { baseUrl: me });

    // Find the representative h-card
    // Per spec: h-card with u-url matching the profile URL
    for (const item of items) {
      if (item.type?.includes("h-card")) {
        const { properties } = item;

        // Check if this h-card represents the user (url matches me)
        const urls = properties.url || [];
        const hasMatchingUrl = urls.some((url) => {
          const urlString = typeof url === "object" ? url.value : url;
          return urlString === me || urlString === me.replace(/\/$/, "");
        });

        if (hasMatchingUrl || urls.length === 0) {
          const profile = {};

          // Extract name
          if (properties.name?.[0]) {
            const name = properties.name[0];
            profile.name = typeof name === "object" ? name.value : name;
          }

          // Extract url
          if (properties.url?.[0]) {
            const url = properties.url[0];
            profile.url = typeof url === "object" ? url.value : url;
          } else {
            profile.url = me;
          }

          // Extract photo
          if (properties.photo?.[0]) {
            const photo = properties.photo[0];
            profile.photo = typeof photo === "object" ? photo.value : photo;
          }

          // Only return if we have at least some profile data
          if (profile.name || profile.photo) {
            return profile;
          }
        }
      }
    }

    // If no h-card found, try looking in nested items
    for (const item of items) {
      if (item.children) {
        for (const child of item.children) {
          if (child.type?.includes("h-card")) {
            const { properties } = child;
            const profile = {};

            if (properties.name?.[0]) {
              const name = properties.name[0];
              profile.name = typeof name === "object" ? name.value : name;
            }

            if (properties.url?.[0]) {
              const url = properties.url[0];
              profile.url = typeof url === "object" ? url.value : url;
            } else {
              profile.url = me;
            }

            if (properties.photo?.[0]) {
              const photo = properties.photo[0];
              profile.photo = typeof photo === "object" ? photo.value : photo;
            }

            if (profile.name || profile.photo) {
              return profile;
            }
          }
        }
      }
    }

    return;
  } catch {
    return;
  }
};
