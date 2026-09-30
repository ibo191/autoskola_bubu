export type ExamFaqItem = { id: string; question: string; answer: string; keywords: string[] };

export const examFaq: ExamFaqItem[] = [
  {
    id: 'exam-01',
    question: 'Kdy dostanu termín zkoušky?',
    answer:
      'Termín zkoušky přiděluje příslušný úřad. Autoškola samotný termín neurčuje. Úřad má pro přidělení termínu zákonem stanovené povinnosti a lhůty, které však bohužel nejsou vždy v praxi dodrženy. Děláme maximum pro to, aby byly žádosti vyřizovány co nejrychleji.',
    keywords: ['termín', 'datum', 'kdy', 'zkouška', 'čekání', 'úřad'],
  },
  {
    id: 'exam-02',
    question: 'Kdo určuje termín zkoušky?',
    answer:
      'Termín zkoušky určuje a přiděluje příslušný úřad. Autoškola nemůže konkrétní datum ani čas zkoušky ovlivnit.',
    keywords: ['termín', 'úřad', 'datum', 'autoškola'],
  },
  {
    id: 'exam-03',
    question: 'Jak poznám, že už mám přidělený termín?',
    answer:
      'V systému Moje Autoškola najdete v sekci Zkoušky informace o přiděleném termínu.\n\nJakmile se zde objeví konkrétní datum a čas, znamená to, že nám úřad termín přidělil a byli jste na něj zařazeni.\n\nO termínu vás zároveň informujeme e-mailem a SMS.',
    keywords: ['Moje Autoškola', 'systém', 'termín', 'SMS', 'email', 'datum'],
  },
  {
    id: 'exam-04',
    question: 'Jak dlouho se čeká na termín zkoušky?',
    answer:
      'O termíny žádáme průběžně. Podle zákona má úřad žadatele zařadit ke zkoušce tak, aby byla zahájena nejpozději do 15 dnů od obdržení žádosti autoškoly.\n\nV praxi však může být čekací doba delší, zejména z důvodu nedostatečné kapacity úřadů a zkušebních komisařů. Prosíme proto o trpělivost. Jakmile termín obdržíme, ihned vás informujeme.',
    keywords: ['čekání', '15 dní', 'lhůta', 'termín', 'úřad'],
  },
  {
    id: 'exam-05',
    question: 'Mohu si vybrat termín zkoušky?',
    answer:
      'Ne. Termín přiděluje úřad a je potřeba se mu pokud možno přizpůsobit.\n\nPokud předem víte, že budete například celý měsíc mimo Českou republiku nebo se z jiného vážného důvodu nemůžete zkoušky zúčastnit, dejte nám tuto informaci co nejdříve.',
    keywords: ['vybrat termín', 'dovolená', 'odjezd', 'termín'],
  },
  {
    id: 'exam-06',
    question: 'Co když mi přidělený termín nevyhovuje?',
    answer:
      'Pokud se přiděleného termínu nemůžete zúčastnit, vaše místo můžeme nabídnout některému z náhradníků.\n\nVy následně čekáte na další termín přidělený úřadem. Ten může být k dispozici až za několik týdnů, proto doporučujeme přidělenému termínu se pokud možno přizpůsobit.',
    keywords: ['termín nevyhovuje', 'změna termínu', 'náhradník'],
  },
  {
    id: 'exam-07',
    question: 'Co když se ke zkoušce nemohu dostavit?',
    answer:
      'Kontaktujte nás co nejdříve a z účasti na zkoušce se omluvte.\n\nPokud se ke zkoušce jednoduše nedostavíte, automaticky tím nezískáváte nový termín. Budete muset čekat na další termín, který úřad autoškole přidělí.',
    keywords: ['omluva', 'nepřijdu', 'nedostavím se', 'nemoc'],
  },
  {
    id: 'exam-08',
    question: 'Kde se zkouška koná?',
    answer:
      'Přesné místo konání zkoušky vám vždy sdělíme v SMS, kterou vás informujeme o přiděleném termínu. Řiďte se údaji v této zprávě.',
    keywords: ['kde', 'místo', 'adresa', 'SMS', 'termín', 'zkouška'],
  },
  {
    id: 'exam-09',
    question: 'V kolik hodin mám na zkoušku přijít?',
    answer:
      'Přesný čas obdržíte v SMS a dalších informacích k termínu zkoušky.\n\nDoporučujeme dorazit alespoň 15 minut předem, aby byl dostatek času na administrativu a organizaci zkoušky.',
    keywords: ['čas', 'kdy přijít', 'SMS', '15 minut'],
  },
  {
    id: 'exam-10',
    question: 'Co si mám vzít s sebou ke zkoušce?',
    answer:
      'Nezapomeňte především:\n- platný doklad totožnosti,\n- řidičský průkaz, pokud už jste jeho držitelem,\n- něco k pití a případně malé jídlo.\n\nZkoušky a čekání mezi jejich jednotlivými částmi mohou zabrat několik hodin.\n\nA pokud to půjde, stres nechte doma.',
    keywords: ['doklady', 'občanka', 'řidičák', 'co s sebou', 'pití', 'jídlo'],
  },
  {
    id: 'exam-11',
    question: 'Musím mít u zkoušky občanský průkaz?',
    answer: 'Ano. Jde o úřední zkoušku a musíte být schopni prokázat svou totožnost.',
    keywords: ['občanka', 'občanský průkaz', 'doklad'],
  },
  {
    id: 'exam-12',
    question: 'Musím mít řidičský průkaz, pokud už nějaký vlastním?',
    answer:
      'Ano. Pokud například rozšiřujete své stávající řidičské oprávnění o další skupinu, vezměte si svůj řidičský průkaz ke zkoušce s sebou.',
    keywords: ['řidičák', 'rozšíření', 'řidičský průkaz'],
  },
  {
    id: 'exam-13',
    question: 'Jak probíhá závěrečná zkouška?',
    answer:
      'Teoretická část probíhá na příslušném úřadě formou zákonem stanoveného testu na počítači. Po jejím úspěšném absolvování následuje praktická zkouška.\n\nMísto praktické zkoušky přiděluje úřad: může začínat u autoškoly nebo v okolí úřadu. Konkrétní místo se dozvíte v SMS s informacemi k vašemu termínu.',
    keywords: ['průběh', 'teorie', 'test', 'počítač', 'praktická jízda', 'úřad', 'místo'],
  },
  {
    id: 'exam-14',
    question: 'Jak probíhá test z pravidel silničního provozu?',
    answer:
      'Test probíhá na příslušném úřadě elektronicky.\n\nObsahuje 25 otázek, maximálně můžete získat 50 bodů a pro úspěšné absolvování potřebujete minimálně 43 bodů. Na test máte standardně 30 minut.\n\nOtázky jsou vybírány z oficiální databáze Ministerstva dopravy.\n\nPokud test neuděláte, v tento den už nemůžete pokračovat k praktické části zkoušky.',
    keywords: ['test', 'otázky', '43 bodů', '50 bodů', '30 minut', 'teorie'],
  },
  {
    id: 'exam-15',
    question: 'Jak probíhá praktická jízda?',
    answer:
      'Praktickou jízdu hodnotí zkušební komisař.\n\nBěhem zkoušky musíte prokázat, že vozidlo bezpečně ovládáte a umíte správně reagovat v běžných dopravních situacích.\n\nU skupiny B se posuzuje například příprava a ovládání vozidla, rozjezdy, zastavení, couvání, parkování, rozjezd do kopce, průjezd křižovatkami, pohyb v běžném provozu a bezpečné rozhodování.\n\nNejde o perfektní jízdu bez jediné drobné chyby. Zásadní je bezpečnost, správné rozhodování a samostatné ovládání vozidla.',
    keywords: ['jízda', 'praktická zkouška', 'komisař', 'parkování'],
  },
  {
    id: 'exam-16',
    question: 'Jak dlouho trvá praktická zkouška?',
    answer:
      'U skupiny B zákon stanoví dvě části praktické zkoušky. První část musí trvat nejméně 10 minut a druhá část nejméně 20 minut.\n\nReálně tedy počítejte minimálně přibližně s 30 minutami. Podle průběhu zkoušky a konkrétní situace může být délka odlišná.',
    keywords: ['jak dlouho', 'délka', '30 minut', 'jízda'],
  },
  {
    id: 'exam-17',
    question: 'Na jakém autě nebo motorce budu zkoušku dělat?',
    answer:
      'Zkouška probíhá na výcvikovém vozidle autoškoly příslušné skupiny.\n\nSnažíme se organizovat zkoušky tak, aby vozidlo bylo studentům co nejvíce známé. Konkrétní vozidlo však závisí na organizaci daného dne a nemůžeme jej vždy garantovat.',
    keywords: ['auto', 'motorka', 'vozidlo', 'zkouška'],
  },
  {
    id: 'exam-18',
    question: 'Pojede se mnou můj běžný instruktor?',
    answer:
      'Nemusí.\n\nU praktické zkoušky vás doprovází kvalifikovaný učitel autoškoly, nemusí to ale být právě instruktor, se kterým jste absolvovali většinu svých jízd.\n\nZkoušku hodnotí zkušební komisař, nikoliv instruktor.',
    keywords: ['instruktor', 'učitel', 'komisař'],
  },
  {
    id: 'exam-19',
    question: 'Co když neudělám test?',
    answer:
      'Pokud u testu neuspějete, nemůžete pokračovat k dalším částem zkoušky.\n\nBudete přihlášeni na opravný termín testu. Teprve po jeho úspěšném absolvování můžete pokračovat v dalších částech zkoušky.',
    keywords: ['neudělám test', 'oprava', 'neúspěch'],
  },
  {
    id: 'exam-20',
    question: 'Co když neudělám praktickou jízdu?',
    answer:
      'Pokud jste úspěšně absolvovali test, ale neuspějete při praktické jízdě, opakujete pouze praktickou část zkoušky, pokud jsou splněny zákonné podmínky platnosti předchozích částí zkoušky.',
    keywords: ['neudělám jízdu', 'opravná jízda', 'neúspěch'],
  },
  {
    id: 'exam-21',
    question: 'Jak se přihlásím na opravnou zkoušku?',
    answer:
      'O přihlášení na opravnou zkoušku požádáte Autoškolu BuBu.\n\nNásledně vás přihlásíme příslušnému úřadu a čekáme na přidělení dalšího termínu.\n\nJakmile jej obdržíme, objeví se v systému Moje Autoškola a budeme vás informovat.',
    keywords: ['oprava', 'opravná zkouška', 'přihlášení'],
  },
  {
    id: 'exam-22',
    question: 'Kolik stojí opravná zkouška?',
    answer:
      'Za opakovanou zkoušku se hradí správní poplatek úřadu a poplatek Autoškole BuBu.\n\nSprávní poplatek úřadu podle typu opakované části:\n- opakovaný test: 100 Kč,\n- zkouška z ovládání a údržby vozidla: 200 Kč,\n- opakovaná praktická jízda: 400 Kč.\n\nPoplatek Autoškole BuBu za opravnou zkoušku je 800 Kč.',
    keywords: ['cena', 'poplatek', 'opravná zkouška', '800 Kč', '400 Kč', '100 Kč'],
  },
  {
    id: 'exam-23',
    question: 'Jak dlouho budu čekat na opravnou zkoušku?',
    answer:
      'Princip je stejný jako u první zkoušky.\n\nAutoškola požádá úřad o termín a termín následně přiděluje úřad.\n\nZákon stanoví, že zkouška má být zahájena nejpozději do 15 dnů od přijetí žádosti autoškoly úřadem. Reálná čekací doba však může být kvůli kapacitě úřadu delší.',
    keywords: ['oprava', 'čekání', 'opravný termín'],
  },
  {
    id: 'exam-24',
    question: 'Mohu si před zkouškou objednat další jízdu?',
    answer:
      'Ano.\n\nPokud si chcete před zkouškou ještě něco procvičit nebo si po delší pauze osvěžit řízení, můžete si objednat další jízdu.\n\nDalší jízdu si domluvte přímo se svým instruktorem.',
    keywords: ['další jízda', 'jízda před zkouškou', 'instruktor', 'procvičit'],
  },
  {
    id: 'exam-25',
    question: 'Mohu si před opravnou zkouškou objednat další jízdy?',
    answer:
      'Ano a zejména při delší pauze mezi zkouškami to doporučujeme.\n\nDalší jízdy nejsou automaticky součástí opravného termínu a objednávají se samostatně podle aktuálního ceníku přímo u instruktora.',
    keywords: ['opravná zkouška', 'další jízda', 'kondiční jízda'],
  },
  {
    id: 'exam-26',
    question: 'Co když mám před zkouškou dlouhou pauzu od poslední jízdy?',
    answer:
      'Pokud máte pocit, že jste část získaných návyků ztratili, doporučujeme si před zkouškou objednat alespoň jednu další jízdu.\n\nNejde o povinnost. Je ale zpravidla lepší si řízení krátce připomenout než jít ke zkoušce po několikatýdenní pauze bez procvičení.',
    keywords: ['pauza', 'dlouho jsem nejel', 'další jízda'],
  },
  {
    id: 'exam-27',
    question: 'Mohu po úspěšné zkoušce hned řídit?',
    answer:
      'Ne automaticky.\n\nÚspěšně složená zkouška je podkladem pro udělení řidičského oprávnění. Po zkoušce je ještě potřeba požádat o jeho udělení nebo rozšíření.\n\nŘídit můžete až ve chvíli, kdy je řidičské oprávnění zapsáno v registru řidičů.',
    keywords: ['po zkoušce', 'můžu řídit', 'řidičské oprávnění'],
  },
  {
    id: 'exam-28',
    question: 'Jak si po zkoušce vyřídím řidičské oprávnění a řidičský průkaz?',
    answer:
      'Po úspěšném absolvování zkoušky můžete požádat o udělení nebo rozšíření řidičského oprávnění.\n\nŽádost je možné vyřídit na příslušném obecním úřadě obce s rozšířenou působností a při splnění podmínek také elektronicky prostřednictvím Portálu dopravy.',
    keywords: ['řidičák', 'po zkoušce', 'Portál dopravy', 'úřad'],
  },
  {
    id: 'exam-29',
    question: 'Na koho se mám obrátit, když mám otázku ke zkoušce?',
    answer:
      'Nejprve zkuste vyhledávání na této stránce. Najdete zde odpovědi na většinu nejčastějších otázek ke zkouškám.\n\nPokud odpověď nenajdete, využijte kontaktní formulář níže.\n\nDotazy ke zkouškám řešíme centrálně.',
    keywords: ['kontakt', 'dotaz', 'otázka', 'pomoc'],
  },
  {
    id: 'exam-30',
    question: 'Mám kvůli termínu nebo organizaci zkoušky kontaktovat svého instruktora?',
    answer:
      'Ne.\n\nInstruktoři nemají na starosti přidělování termínů zkoušek a zpravidla nemají více informací než vedení autoškoly.\n\nDotazy týkající se termínu, přihlášení, organizace nebo opravné zkoušky proto neposílejte instruktorům.\n\nPoužijte informace na této stránce nebo kontaktní formulář. Díky tomu se váš dotaz dostane přímo k člověku, který agendu zkoušek řeší.\n\nVýjimkou je objednání další jízdy před zkouškou – tu řeší student přímo se svým instruktorem.',
    keywords: ['instruktor', 'kontakt', 'termín', 'organizace'],
  },
];

export function normalizeExamSearch(value: string) {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function filterExamFaq(items: ExamFaqItem[], query: string) {
  const terms = normalizeExamSearch(query).split(' ').filter(Boolean);
  if (!terms.length) return items;
  return items.filter((item) => {
    const haystack = normalizeExamSearch([item.question, item.answer, ...item.keywords].join(' '));
    return terms.every((term) => haystack.includes(term));
  });
}
