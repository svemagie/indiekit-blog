# @rmdes/indiekit-endpoint-github

A GitHub activity endpoint plugin for [Indiekit](https://getindiekit.com). Display your GitHub commits, stars, contributions, and featured repositories in your Indiekit admin dashboard, with a public JSON API for use in your static site.

## Features

- **Featured Projects**: Showcase specific repositories with recent commits
- **Recent Commits**: Display your latest commits across repositories
- **Starred Repositories**: Show repos you've recently starred
- **PRs & Issues**: Track your open source contributions
- **Public API**: JSON endpoints for integrating with static site generators

## Installation

```bash
npm install @rmdes/indiekit-endpoint-github
```

## Configuration

Add the plugin to your Indiekit configuration:

```javascript
export default {
  plugins: [
    "@rmdes/indiekit-endpoint-github",
    // ... other plugins
  ],

  "@rmdes/indiekit-endpoint-github": {
    // Required: Your GitHub username
    username: "your-username",

    // Optional: GitHub personal access token for higher rate limits
    // and access to private repos (set via GITHUB_TOKEN env var)
    token: process.env.GITHUB_TOKEN,

    // Optional: Mount path for the endpoint (default: "/github")
    mountPath: "/github-api",

    // Optional: Cache duration in milliseconds (default: 15 minutes)
    cacheTtl: 900_000,

    // Optional: Limits for each section
    limits: {
      commits: 10,
      stars: 20,
      contributions: 10,
      repos: 10,
    },

    // Optional: Featured repositories to showcase with commits
    featuredRepos: [
      "owner/repo-name",
      "owner/another-repo",
    ],
  },
};
```

## Endpoints

### Protected (require authentication)

- `GET /github-api/` - Dashboard view with all sections
- `GET /github-api/commits` - Recent commits page
- `GET /github-api/stars` - Starred repositories page
- `GET /github-api/contributions` - PRs & Issues page
- `GET /github-api/activity` - Activity feed page

### Public API (no authentication)

- `GET /github-api/api/commits` - JSON: Recent commits
- `GET /github-api/api/stars` - JSON: Starred repositories
- `GET /github-api/api/activity` - JSON: Activity feed
- `GET /github-api/api/featured` - JSON: Featured repositories with commits

## Using the Public API

The public API endpoints return JSON and can be used by your static site generator (Eleventy, Hugo, etc.) to display GitHub activity on your public site.

Example Eleventy data file:

```javascript
import EleventyFetch from "@11ty/eleventy-fetch";

export default async function() {
  const url = "https://your-site.com/github-api/api/featured";

  const data = await EleventyFetch(url, {
    duration: "15m",
    type: "json",
  });

  return data.featured || [];
}
```

## Environment Variables

- `GITHUB_TOKEN` - Optional GitHub personal access token for:
  - Higher API rate limits (5000/hour vs 60/hour)
  - Access to private repository information

## License

MIT
