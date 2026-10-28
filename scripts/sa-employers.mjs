// South African employers (and international ones with South African offices) whose vacancies are published through
// public hiring-system feeds. These feeds are meant for anyone to show a company's open jobs, and need no key.
//
// The updater tries each name on each system below, remembers which ones answer (state.json → ats),
// and only re-checks the ones that didn't answer once a week. Add more names any time: one per line.
//
//   gh  = Greenhouse         lever = Lever (US and EU)     sr = SmartRecruiters
//   wk  = Workable           ashby = Ashby                 rc = Recruitee          bamboo = BambooHR
//
// Names are tried as written (SmartRecruiters ids are case-sensitive) and in lower case without spaces.

export const knownBoards = [
  // Checked by hand.
  'gh:ozow', 'lever:Yassir', 'lever:moo', 'lever:dlocal', 'sr:Deloitte6',
];

export const employers = `
ozow luno yoco takealot takealotgroup superbalist peachpayments stitch stitchmoney offerzen aerobotics jumo lulalend retailcapital
tymebank tyme sweepsouth getsmarter 2u mukuru paystack flutterwave andela clickatell payfast valr revio entersekt lightstone
smileidentity chippercash wetu onecart pargo bobgo shopstar iress synthesis entelect bbd dvt retrorabbit netstar ctrack cartrack
karooooo mixtelematics naspers prosus uber bolt glovo yassir moo dlocal mrdfood mrd payu adumo lesaka kazang flash netcash
ikhokha snapscan zapper luno-careers easyequities satrix sygnia allangray ninetyone coronation prescient ashburton investec
discovery vitality oldmutual sanlam momentum liberty hollard santam outsurance kingprice miway budgetinsurance dialdirect
standardbank absa nedbank fnb firstrand capitec africanbank tymebankza
deloitte Deloitte6 pwc kpmg ey accenture bdo forvismazars grantthornton bakertilly mazars
mediclinic netcare lifehealthcare lifehealthcaregroup dischem clicks clicksgroup alphapharm aspen adcock adcockingram
shoprite shopriteholdings picknpay woolworths woolworthssa tfg thefoschinigroup mrprice mrpricegroup pepkor pep ackermans
massmart game makro builders spar sparsa famousbrands spur spurcorporation nandos kfcsa mcdonaldssa steers debonairs
tigerbrands rclfoods astral avi distell heineken heinekensa sab ccba ccbsa pioneer pioneerfoods quantum
imperial imperiallogistics barloworld bidvest bidcorp supergroup dhl dsv unitrans ctlogistics fedex ups aramex thecourierguy
sasol mtn mtngroup vodacom vodacomgroup telkom cellc rain liquid liquidintelligent nttdata dimensiondata altron bcx eoh
suninternational tsogosun citylodge proteahotels marriott hilton radisson legacyhotels
hollywoodbets betway sportingbet
sappi mondi angloamerican sibanyestillwater implats harmony goldfields exxaro south32 kumba glencore afrimat ppc
murrayroberts wbho aveng raubex grindrod aurecon zutari wsp aecom hatch worley
amazon amazonsa aws microsoft google salesforce oracle sap ibm huawei samsung
teraco seacom vumatel openserve afrihost axxess webafrica cooltech
takealotcareers checkers sixty60 superspar okfoods boxer usave
truworths edcon jet foschini sportscene totalsports
gijima eohholdings datatec westcon mustek dataprotect
ubuntu canonical
`.split(/\s+/).filter(Boolean);
