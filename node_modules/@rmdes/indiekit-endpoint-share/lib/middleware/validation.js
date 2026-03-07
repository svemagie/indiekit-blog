import { check } from "express-validator";

export const validate = [
  // Name is always required
  check("name")
    .notEmpty()
    .withMessage((value, { req, path }) => req.__(`share.error.${path}.empty`)),
  // bookmark-of is required only for bookmark type
  check("bookmark-of")
    .if((value, { req }) => (req.body.type || "bookmark") === "bookmark")
    .exists()
    .isURL()
    .withMessage((value, { req, path }) =>
      req.__(`share.error.${path}.empty`, "https://example.org"),
    ),
  // url is required for note type (used to build content)
  check("url")
    .if((value, { req }) => req.body.type === "note")
    .notEmpty()
    .isURL()
    .withMessage((value, { req }) =>
      req.__(`share.error.bookmark-of.empty`, "https://example.org"),
    ),
];
