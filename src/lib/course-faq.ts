import { motoEnrollmentPausedMessage, type Course } from './catalog';

export type CourseFaq = readonly [question: string, answer: string];

export function courseFaqs(course: Course): CourseFaq[] {
  if (course.id === 'kondicni') {
    return [
      [
        'Pro koho jsou kondiční jízdy?',
        'Pro držitele platného řidičského průkazu skupiny B, kteří chtějí obnovit jistotu za volantem nebo procvičit konkrétní situace.',
      ],
      [
        'Kolik trvá jedna jízda a kolik stojí?',
        'Jedna vyučovací hodina trvá 45 minut a stojí 800 Kč. Jezdíme vždy v 90minutových blocích za 1 600 Kč. Dva bloky znamenají 180 minut, tedy čtyři vyučovací hodiny.',
      ],
      [
        'Mohu si vybrat manuál nebo automat?',
        'Na Střížkově nabízíme manuál i automat. V Kladně a Statenicích pouze manuál. Pro manuál potřebujete odpovídající řidičské oprávnění bez omezení na automat.',
      ],
      [
        'Rezervuji si rovnou termín jízdy?',
        'V objednávce vybíráte termín osobního zápisu. Samotné jízdy s Vámi domluvíme individuálně. Na Kladně Vás kontaktuje pobočka a dohodne také termín zápisu.',
      ],
    ];
  }
  if (course.id === 'b') {
    return [
      [
        'Jak se přihlásím do kurzu skupiny B?',
        'Online vyplníte objednávku a v posledním kroku si zvolíte termín zápisu. E-mail není nutné předem ověřovat.',
      ],
      [
        'Co vyřeším na pobočce?',
        'Při zápisu spolu projdeme dokumenty, domluvíme platbu a oznámíme vám datum zahájení kurzu.',
      ],
      [
        'Mohu dělat skupinu B na automat?',
        'Ano. Výcvik na automat nabízíme na Střížkově. Pokud chcete později řídit manuál, zvolte klasickou skupinu B.',
      ],
      [
        'Jak probíhá teorie a výcvik?',
        'Výuka má jasný postup. Teorie se propojuje s jízdami a kromě zákonného minima se věnujeme i reálným situacím v provozu.',
      ],
    ];
  }
  if (course.id === 'b-automat') {
    return [
      [
        'Můžu po kurzu na automat řídit manuál?',
        'Ne. Oprávnění bude platit pro vozidla s automatickou převodovkou. Pokud chcete řídit i manuál, zvolte klasickou skupinu B.',
      ],
      [
        'Je automat vhodný pro začátečníka?',
        'Ano. Můžete se více soustředit na provoz, přednosti a bezpečnou jízdu.',
      ],
      [
        'Kde výcvik na automat probíhá?',
        'Výcvik na automat nabízíme na pobočce Praha 8 – Střížkov.',
      ],
    ];
  }
  if (course.id === 'l17') {
    return [
      [
        'Co znamená režim L17?',
        'Po úspěšné zkoušce můžete řídit od 17 let s předepsaným mentorem až do dovršení 18 let.',
      ],
      [
        'Je kurz L17 jiný než běžná skupina B?',
        'Výuka a výcvik odpovídají skupině B. Rozdíl je v navazujícím řízení s mentorem po získání oprávnění.',
      ],
      [
        'Co vyřídíme při zápisu?',
        'Společně projdeme dokumenty, platbu, termín začátku kurzu a vše potřebné pro zahájení výuky.',
      ],
    ];
  }
  if (course.category === 'moto') {
    return [
      [`Je možné se nyní přihlásit do kurzu ${course.label}?`, motoEnrollmentPausedMessage],
      [
        'Kde motocyklový výcvik probíhá?',
        'Motocyklový výcvik poskytujeme na pobočce Praha 8 – Střížkov.',
      ],
      [
        'Jak vyberu správnou skupinu?',
        'Správnou skupinu a postup výcviku vždy ověříme podle vašeho věku, současného oprávnění a zkušeností.',
      ],
    ];
  }
  if (course.id === 'b96') {
    return [
      [
        'Kdy potřebuji rozšíření B96?',
        'B96 je vhodné pro situace, kdy běžná skupina B pro vaši jízdní soupravu nestačí, ale nepotřebujete rovnou skupinu B+E.',
      ],
      ['Kde výcvik B96 probíhá?', 'Výcvik s přívěsem poskytujeme na pobočce Praha 8 – Střížkov.'],
      [
        'Pomůžete mi vybrat mezi B96 a B+E?',
        'Ano. Při zápisu s vámi projdeme, jakou soupravu potřebujete řídit, a pomůžeme zvolit správné rozšíření.',
      ],
    ];
  }
  return [
    [
      'Pro koho je skupina B+E vhodná?',
      'Pro řidiče, kteří potřebují řídit soupravu s těžším přívěsem, vozíkem, karavanem nebo pracovní soupravou.',
    ],
    ['Kde výcvik B+E probíhá?', 'Výcvik s přívěsem poskytujeme na pobočce Praha 8 – Střížkov.'],
    [
      'Co vyřešíme při zápisu?',
      'Společně projdeme potřebné dokumenty, postup výcviku a termín zahájení kurzu.',
    ],
  ];
}
