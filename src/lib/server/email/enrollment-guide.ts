import { money } from '../../format';
import { escapeHtml } from './utils';

export const autoSchoolAppLinks = [
  ['App Store', 'https://apps.apple.com/cz/app/moje-auto%C5%A1kola/id1449593403'],
  ['Google Play', 'https://play.google.com/store/apps/details?id=cz.moje_autoskola&hl=cs'],
] as const;

export function isCategoryBCourse(course?: string) {
  return course === 'b' || course === 'b-automat' || course === 'l17';
}

type GuideSection = {
  title: string;
  paragraphs?: string[];
  steps?: string[];
  links?: readonly (readonly [string, string])[];
};

export function categoryBEnrollmentGuide(origin: string, coursePriceCzk?: number) {
  const priceListUrl = new URL('/cenik', origin).href;
  const blue = '#2c56a0';
  const dark = '#142338';
  const mint = '#e9f6f4';
  const light = '#f1f5f8';
  const intro =
    'Dobrý den, vítejte v Autoškole BuBu. Tento průvodce vás provede kurzem skupiny B od zápisu až ke zkouškám.';
  const journey = 'Zápis → Přednášky → Interní test → Praktický výcvik → Zkoušky';
  const sections: GuideSection[] = [
    {
      title: 'Přednášky a zdravověda',
      paragraphs: [
        'Během kurzu absolvujete čtyři přednášky. První tři absolvujte ve stanoveném pořadí.',
      ],
      steps: [
        'Jako první absolvujte úvodní teoretickou přednášku.',
        'Po úvodní přednášce pokračujte navazující výukou.',
        'Po druhé přednášce následuje teoretická výuka s interním připouštěcím testem.',
        'Na zdravovědu můžete jít kdykoli po úvodní přednášce.',
      ],
    },
    {
      title: 'Interní připouštěcí test',
      paragraphs: [
        'Na třetí přednášce vás čeká 50 otázek z pravidel silničního provozu. Úspěšné zvládnutí testu je podmínkou pro jízdy v běžném provozu.',
        'Pokud test napoprvé nezvládnete, máte týden na přípravu a poté ho můžete opakovat v učebně. Při dalším neúspěchu je potřeba znovu absolvovat teoretickou výuku, která se hradí podle podmínek kurzu.',
      ],
    },
    {
      title: 'Učebnice a online studovna',
      paragraphs: [
        'V aplikaci Moje Autoškola najdete online studovnu s výukovými materiály. Od autoškoly máte plný a neomezený přístup do této online učebny. Doporučujeme projít si všechny výukové materiály.',
        'V ceně kurzu je také tištěná učebnice a cvičné eTesty. Výsledky cvičných testů může autoškola sledovat.',
        'Přístupové údaje vám přijdou e-mailem po zpracování zápisu. Pokud e-mail nenajdete, zkontrolujte i složku Spam.',
      ],
      links: autoSchoolAppLinks,
    },
    {
      title: 'Praktické jízdy',
      paragraphs: [
        'Výcvik skupiny B zahrnuje 28 vyučovacích hodin. První dvě probíhají na cvičišti, potom přejdete od jednoduššího k náročnějšímu provozu.',
        'Po splnění podmínek vám přidělíme instruktora a termíny si domluvíte přímo s ním. Počet jízd za týden není omezený. Pokud má instruktor volnou kapacitu, můžete se domluvit i na více jízdách týdně.',
        'Pokud vám jízdy v ceně kurzu nestačí nebo si chcete před zkouškou ještě něco procvičit, můžete si dokoupit další jízdy.',
      ],
    },
    {
      title: 'Cena a úhrada',
      paragraphs: [
        coursePriceCzk
          ? `Cena kurzu podle vaší objednávky je ${money(coursePriceCzk)}. Kurz můžete uhradit při zápisu nebo do 5 dnů od zápisu.`
          : 'Výši kurzovného najdete v potvrzení objednávky nebo v dohodě ze zápisu. Kurz můžete uhradit při zápisu nebo do 5 dnů od zápisu.',
        'Můžete si domluvit tři splátky nebo individuální splátkový kalendář. První splátka je splatná do 5 dnů od zápisu. Konkrétní částky a termíny najdete v platebních pokynech.',
        'Závěrečné a opravné zkoušky i další služby se hradí samostatně podle platných podmínek a ceníku.',
      ],
      links: [['Zobrazit ceník', priceListUrl]],
    },
    {
      title: 'Omlouvání přednášek a jízd',
      paragraphs: [
        'Z přednášky se odhlaste nejpozději 24 hodin před začátkem. Pokud rezervaci nemůžete zrušit v systému, napište nám co nejdříve důvod na info@autoskolabubu.cz.',
        'Jízdy omlouvejte přímo u instruktora nejméně 24 hodin předem. Při náhlé nemoci se ozvěte hned. Podle VOP může autoškola účtovat 400 Kč za každou hodinu omluvenou méně než 24 hodin předem a 700 Kč za neomluvenou hodinu. Nečekané situace posuzujeme individuálně.',
      ],
      links: [
        ['Napsat autoškole', 'mailto:info@autoskolabubu.cz'],
        ['Obchodní podmínky', new URL('/obchodni-podminky', origin).href],
      ],
    },
    {
      title: 'Závěrečné zkoušky',
      paragraphs: [
        'Po dokončení teorie a praktického výcviku vás přihlásíme k závěrečným zkouškám. Čeká vás test z pravidel a praktická jízda.',
        'Termín přiděluje příslušný úřad. Čekání může trvat přibližně týden i déle než měsíc. O přiděleném termínu vás budeme informovat.',
      ],
    },
    {
      title: 'Vaše nejbližší kroky',
      steps: [
        'Sledujte e-mail a aplikaci Moje Autoškola.',
        'V aplikaci se přihlašujte na další přednášky ve správném pořadí a kontrolujte si své rezervace.',
        'Průběžně procvičujte testy a případnou absenci omluvte včas.',
      ],
    },
  ];

  const html = [
    `<p style="margin:0 0 18px;color:${dark};font-size:16px;line-height:1.55;">${escapeHtml(intro)}</p>`,
    `<table role="presentation" width="100%" style="border-collapse:separate;margin:0 0 14px;"><tr><td bgcolor="${blue}" style="padding:16px;border-radius:14px;color:#ffffff;"><h2 style="font-size:18px;margin:0 0 6px;color:#ffffff;">Jak bude kurz probíhat</h2><p style="font-size:15px;line-height:1.5;margin:0;color:#ffffff;">${escapeHtml(journey)}</p></td></tr></table>`,
    ...sections.map(({ title, paragraphs, steps, links }, index) => {
      const background = index % 2 === 0 ? mint : light;
      return `<table role="presentation" width="100%" style="border-collapse:separate;margin:0 0 12px;"><tr><td bgcolor="${background}" style="padding:16px;border-radius:14px;color:${dark};font-size:15px;line-height:1.55;"><h2 style="font-size:19px;line-height:1.25;margin:0 0 8px;color:${dark};">${escapeHtml(title)}</h2>${(paragraphs ?? []).map((p) => `<p style="margin:0 0 8px;">${escapeHtml(p)}</p>`).join('')}${steps ? `<ol style="padding-left:23px;margin:0 0 4px;">${steps.map((step) => `<li style="margin:0 0 4px;">${escapeHtml(step)}</li>`).join('')}</ol>` : ''}${links ? `<p style="margin:4px 0 0;">${links.map(([label, url]) => `<a href="${escapeHtml(url)}" style="color:${blue};font-weight:700;text-decoration:underline;">${escapeHtml(label)}</a>`).join(' &nbsp;·&nbsp; ')}</p>` : ''}</td></tr></table>`;
    }),
    '<p style="margin:18px 0 0;">S pozdravem<br>Autoškola BuBu</p>',
  ].join('');
  const text = [
    intro,
    `Jak bude kurz probíhat\n${journey}`,
    ...sections.map(({ title, paragraphs, steps, links }) =>
      [
        title,
        ...(paragraphs ?? []),
        ...(steps ?? []).map((step, index) => `${index + 1}. ${step}`),
        ...(links ?? []).map(([label, url]) => `${label} ${url}`),
      ].join('\n'),
    ),
    'S pozdravem\nAutoškola BuBu',
  ].join('\n\n');
  return { html, text };
}
