interface LanguageBadgesProps {
  languages: string[];
  dominantLanguage?: string;
  isCodeMixed?: boolean;
}

export function LanguageBadges({
  languages,
  dominantLanguage,
  isCodeMixed = false,
}: LanguageBadgesProps) {
  const uniqueLanguages = Array.from(new Set(languages.filter(Boolean)));

  return (
    <div className="badge-row">
      {dominantLanguage ? (
        <span className="meta-chip meta-chip-strong">
          Dominant: {dominantLanguage.toUpperCase()}
        </span>
      ) : null}
      {uniqueLanguages.map((language) => (
        <span className="meta-chip" key={language}>
          {language.toUpperCase()}
        </span>
      ))}
      {isCodeMixed ? <span className="meta-chip meta-chip-alert">Code mixed</span> : null}
    </div>
  );
}
