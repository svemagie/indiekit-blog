import { IndiekitError } from "@indiekit/error";
import { validationResult } from "express-validator";

export const shareController = {
  /**
   * View share page
   * @type {import("express").RequestHandler}
   */
  get(request, response) {
    const { publication } = request.app.locals;
    const { content, name, url, success } = request.query;

    const syndicationTargetItems = (
      publication.syndicationTargets || []
    ).map((target) => ({
      label: target.info.service.name,
      ...(target?.info?.error
        ? {
            disabled: true,
            hint: target?.info?.error || false,
          }
        : {
            hint: target?.info.uid,
            value: target?.info.uid,
          }),
    }));

    response.render("share", {
      title: response.locals.__("share.title"),
      data: { content, name, url },
      syndicationTargetItems,
      success,
      minimalui: request.params.path === "bookmarklet",
    });
  },

  /**
   * Post share content
   * @type {import("express").RequestHandler}
   */
  async post(request, response) {
    const { application, publication } = request.app.locals;
    const data = request.body || {};
    data["bookmark-of"] = data.url || data["bookmark-of"];
    delete data.url;

    // Extract mp-syndicate-to for proper encoding
    const syndicateTo = data["mp-syndicate-to"];
    delete data["mp-syndicate-to"];

    const syndicationTargetItems = (
      publication.syndicationTargets || []
    ).map((target) => ({
      label: target.info.service.name,
      ...(target?.info?.error
        ? {
            disabled: true,
            hint: target?.info?.error || false,
          }
        : {
            hint: target?.info.uid,
            value: target?.info.uid,
          }),
    }));

    const errors = validationResult(request);
    if (!errors.isEmpty()) {
      return response.status(422).render("share", {
        title: response.locals.__("share.title"),
        data: request.body,
        syndicationTargetItems,
        errors: errors.mapped(),
        minimalui: request.params.path === "bookmarklet",
      });
    }

    try {
      // Build URLSearchParams manually to handle mp-syndicate-to array
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(data)) {
        params.append(key, value);
      }
      if (syndicateTo) {
        const targets = Array.isArray(syndicateTo)
          ? syndicateTo
          : [syndicateTo];
        for (const target of targets) {
          params.append("mp-syndicate-to", target);
        }
      }

      const micropubResponse = await fetch(application.micropubEndpoint, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      });

      if (!micropubResponse.ok) {
        throw await IndiekitError.fromFetch(micropubResponse);
      }

      /** @type {object} */
      const body = await micropubResponse.json();

      const message = encodeURIComponent(body.success_description);

      response.redirect(`?success=${message}`);
    } catch (error) {
      response.status(error.status || 500);
      response.render("share", {
        title: response.locals.__("share.title"),
        data: request.body,
        syndicationTargetItems,
        error,
        minimalui: request.params.path === "bookmarklet",
      });
    }
  },
};
