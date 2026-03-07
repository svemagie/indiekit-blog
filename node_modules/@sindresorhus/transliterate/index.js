import builtinReplacements from './replacements.js';
import localeReplacements from './locale-replacements.js';

// TODO: Use Regex.escape when targeting Node.js 24.
const escapeRegex = string => string.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

const buildReplacementPattern = replacements => {
	// Sort by key length descending so longer patterns match first (e.g., 'ու' before 'ո')
	const sortedKeys = [...replacements.keys()].sort((a, b) => b.length - a.length);
	return new RegExp(sortedKeys.map(key => escapeRegex(key)).join('|'), 'gu');
};

// Pre-compile the default pattern for performance
const defaultPattern = buildReplacementPattern(builtinReplacements);

// Pre-compile locale patterns
const localeCache = new Map();

for (const [locale, localeMap] of Object.entries(localeReplacements)) {
	const replacements = new Map(builtinReplacements);
	for (const [key, value] of localeMap) {
		replacements.set(key, value);
	}

	localeCache.set(locale, {
		replacements,
		pattern: buildReplacementPattern(replacements),
	});
}

const normalizeLocale = locale => {
	if (!locale) {
		return;
	}

	const normalizedLocale = locale.toLowerCase()
		// Norwegian (no) is an alias for Norwegian Bokmål (nb)
		.replace(/^no(-|$)/, 'nb$1');

	if (Object.hasOwn(localeReplacements, normalizedLocale)) {
		return normalizedLocale;
	}

	const prefix = normalizedLocale.split('-')[0];
	if (Object.hasOwn(localeReplacements, prefix)) {
		return prefix;
	}
};

export default function transliterate(string, options) {
	if (typeof string !== 'string') {
		throw new TypeError(`Expected a string, got \`${typeof string}\``);
	}

	options = {
		customReplacements: [],
		...options,
	};

	const normalizedLocale = normalizeLocale(options.locale);
	const customReplacements = [...options.customReplacements];

	let replacements = builtinReplacements;
	let pattern = defaultPattern;

	if (normalizedLocale) {
		({replacements, pattern} = localeCache.get(normalizedLocale));
	}

	string = string.normalize();

	// Apply customReplacements separately (avoids expensive regex compilation)
	if (customReplacements.length > 0) {
		// Sort by key length descending so longer patterns match first
		customReplacements.sort((a, b) => b[0].length - a[0].length);
		for (const [key, value] of customReplacements) {
			string = string.replaceAll(key, value);
		}
	}

	string = string.replace(pattern, match => replacements.get(match) ?? match);
	string = string.normalize('NFD').replaceAll(/\p{Diacritic}/gu, '').normalize();

	// Normalize all dash types to hyphen-minus
	string = string.replaceAll(/\p{Dash_Punctuation}/gu, '-');

	return string;
}
