import path from "node:path";

import { validationResult } from "express-validator";

import { endpoint } from "../endpoint.js";

export const formController = {
  /**
   * Get file to upload
   * @type {import("express").RequestHandler}
   */
  async get(request, response) {
    const { filesPath, scope } = response.locals;

    if (scope.includes("create") || scope.includes("media")) {
      return response.render("file-form", {
        back: {
          href: path.dirname(request.baseUrl + request.path),
        },
        title: response.locals.__("files.upload.title"),
      });
    }

    response.redirect(filesPath);
  },

  /**
   * Post file to media endpoint
   * @type {import("express").RequestHandler}
   */
  async post(request, response) {
    const { mediaEndpoint } = request.app.locals.application;
    const { accessToken } = response.locals;

    const errors = validationResult(request);
    if (!errors.isEmpty()) {
      return response.status(422).render("file-form", {
        title: response.locals.__("files.upload.title"),
        errors: errors.mapped(),
      });
    }

    // Caught by validation, but needed to satisfy nullable UploadedFile typedef
    if (!Object.entries(request?.files)) {
      throw new Error(response.locals.__("files.error.file.empty"));
    }

    // Normalize to array (supports both single and multi-file upload)
    const uploadedFiles = Array.isArray(request.files.file)
      ? request.files.file
      : [request.files.file];

    const results = [];
    for (const file of uploadedFiles) {
      const formData = new FormData();
      formData.append("file", new Blob([file.data]), file.name);

      try {
        await endpoint.post(mediaEndpoint, accessToken, formData);
        results.push({ name: file.name, success: true });
      } catch {
        results.push({ name: file.name, success: false });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;

    let message;
    if (failCount === 0) {
      message =
        successCount === 1
          ? `${successCount} file uploaded`
          : `${successCount} files uploaded`;
    } else {
      message = `${successCount} uploaded, ${failCount} failed`;
    }

    response.redirect(
      `${request.baseUrl}?success=${encodeURIComponent(message)}`,
    );
  },
};
