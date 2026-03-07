import { getProfileInformation } from "../profile.js";
import { signToken } from "../token.js";

export const tokenController = {
  /**
   * Authorization code request
   *
   * Redeem verified authorization code for an access token.
   * @type {import("express").RequestHandler}
   * @see {@link https://indieauth.spec.indieweb.org/#redeeming-the-authorization-code}
   * @see {@link https://indieauth.spec.indieweb.org/#access-token-response}
   */
  async post(request, response) {
    const { me, scope } = request.verifiedToken;

    const tokenData = { me, ...(scope && { scope }) };
    const accessToken = {
      access_token: signToken(tokenData, "90d"),
      token_type: "Bearer",
      ...tokenData,
    };

    // Include profile information if profile scope was requested
    if (scope && scope.includes("profile")) {
      const profile = await getProfileInformation(me);
      if (profile) {
        accessToken.profile = profile;
      }
    }

    if (request.accepts("application/json")) {
      response.json(accessToken);
    } else {
      response.set("content-type", "application/x-www-form-urlencoded");
      // Flatten profile for form-urlencoded response
      const parameters = new URLSearchParams();
      for (const [key, value] of Object.entries(accessToken)) {
        if (key === "profile" && typeof value === "object") {
          // Encode profile as JSON string for form-urlencoded
          parameters.set("profile", JSON.stringify(value));
        } else {
          parameters.set(key, String(value));
        }
      }
      response.send(parameters.toString());
    }
  },
};
