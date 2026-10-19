# NutriGlance

AI-assisted meal logging, nutrition tracking, hydration, and recipe suggestions.

## License

Copyright (c) 2026 Vishesh Singh. All rights reserved.

NutriGlance is proprietary software. Reuse, modification, and redistribution of
the original repository materials require written permission from the copyright
holder, subject to the exceptions in [LICENSE](LICENSE). GitHub platform rights
and third-party licenses continue to apply.

For licensing permission, contact [Vishesh Singh](https://github.com/visheshsingh123).

## Development

Use Node.js 24, then run `npm ci`, `npm run build`, and `npm test`.

See [security deployment](docs/security-setup.md), [reminder setup](docs/reminders.md),
and the [Android APK guide](docs/android-apk.md) for configuration instructions.

## Saved recipes

In AI Chef, choose **Save recipe**, then open **Saved recipes** to search by name
or ingredient, read the method, change servings, or log a meal. Each account can
save up to 50 recipes. Saving and removing require an internet connection.

The authenticated `/api/saved-recipes` endpoint uses the existing Firebase Admin
configuration. Recipes live in `users/{uid}/savedRecipes`; a private transaction
record serializes collection additions. Client requests cannot choose the owner.
No additional environment variables or client Firestore permissions are needed.

## Shared accessibility and styles

Every page loads `design-system.css` and `accessibility.js` for shared colors,
control sizing, focus rings, skip links, and keyboard behavior. Keep page-specific
layouts in their existing stylesheets. Check both themes and mobile widths when
changing these foundations; errors should identify the field and move focus to it.
