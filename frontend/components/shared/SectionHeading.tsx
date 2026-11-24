type SectionHeadingProps = {
  eyebrow: string;
  title: string;
  description: string;
  id?: string;
  align?: 'left' | 'center';
  tone?: 'dark' | 'light';
};

export function SectionHeading({
  eyebrow,
  title,
  description,
  id,
  align = 'left',
  tone = 'dark',
}: SectionHeadingProps) {
  const centered = align === 'center';
  const light = tone === 'light';

  return (
    <div className={`${centered ? 'mx-auto text-center' : ''} max-w-2xl`}>
      <p
        className={`mb-4 text-xs font-semibold uppercase tracking-[0.16em] ${light ? 'text-lime' : 'text-midnight/60'}`}
      >
        {eyebrow}
      </p>
      <h2
        id={id}
        className={`text-balance text-3xl font-semibold leading-tight tracking-[-0.04em] sm:text-4xl lg:text-[3.25rem] ${light ? 'text-white' : 'text-midnight'}`}
      >
        {title}
      </h2>
      <p
        className={`mt-5 max-w-xl text-base leading-7 sm:text-lg ${centered ? 'mx-auto' : ''} ${light ? 'text-white/70' : 'text-midnight/70'}`}
      >
        {description}
      </p>
    </div>
  );
}
