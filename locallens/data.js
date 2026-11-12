'use strict';
/* LocalLens data layer. EVERYTHING below that is not a state/UT or city name is SAMPLE DATA.
   Scaling plan: STATES, CITIES and LANDMARKS can later be loaded from JSON files or an API
   (same field names). Sample placeholder listings are generated per city on demand
   (see script.js gen()), so adding a city costs one line and no extra listing data. */

const STATES = [
 ['AP','Andhra Pradesh'],['AR','Arunachal Pradesh'],['AS','Assam'],['BR','Bihar'],['CG','Chhattisgarh'],['GA','Goa'],['GJ','Gujarat'],['HR','Haryana'],['HP','Himachal Pradesh'],['JH','Jharkhand'],['KA','Karnataka'],['KL','Kerala'],['MP','Madhya Pradesh'],['MH','Maharashtra'],['MN','Manipur'],['ML','Meghalaya'],['MZ','Mizoram'],['NL','Nagaland'],['OD','Odisha'],['PB','Punjab'],['RJ','Rajasthan'],['SK','Sikkim'],['TN','Tamil Nadu'],['TS','Telangana'],['TR','Tripura'],['UP','Uttar Pradesh'],['UK','Uttarakhand'],['WB','West Bengal']
].map(([code,name])=>({code,name,type:'State'})).concat([
 ['AN','Andaman and Nicobar Islands'],['CH','Chandigarh'],['DD','Dadra and Nagar Haveli and Daman and Diu'],['DL','Delhi (NCT)'],['JK','Jammu and Kashmir'],['LA','Ladakh'],['LD','Lakshadweep'],['PY','Puducherry']
].map(([code,name])=>({code,name,type:'Union Territory'})));

/* [id, name, stateCode, popular(1/0)]  popular cities show on the homepage and in "All India" views */
const CITIES = [
 ['delhi','Delhi','DL',1],['mumbai','Mumbai','MH',1],['pune','Pune','MH',1],['bengaluru','Bengaluru','KA',1],['mysuru','Mysuru','KA',1],
 ['hyderabad','Hyderabad','TS',1],['chennai','Chennai','TN',1],['coimbatore','Coimbatore','TN',1],['kolkata','Kolkata','WB',1],['ahmedabad','Ahmedabad','GJ',1],
 ['jaipur','Jaipur','RJ',1],['udaipur','Udaipur','RJ',1],['lucknow','Lucknow','UP',1],['varanasi','Varanasi','UP',1],['agra','Agra','UP',1],
 ['chandigarh','Chandigarh','CH',1],['ludhiana','Ludhiana','PB',1],['amritsar','Amritsar','PB',1],['panaji','Panaji','GA',1],['kochi','Kochi','KL',1],
 ['thiruvananthapuram','Thiruvananthapuram','KL',1],['shimla','Shimla','HP',1],['manali','Manali','HP',1],['leh','Leh','LA',1],['srinagar','Srinagar','JK',1],
 ['guwahati','Guwahati','AS',1],['shillong','Shillong','ML',1],['gangtok','Gangtok','SK',1],['bhubaneswar','Bhubaneswar','OD',1],['indore','Indore','MP',1],
 ['bhopal','Bhopal','MP',1],['dehradun','Dehradun','UK',1],['rishikesh','Rishikesh','UK',1],['patna','Patna','BR',1],['ranchi','Ranchi','JH',1],
 ['raipur','Raipur','CG',1],['puducherry','Puducherry','PY',1],['portblair','Port Blair','AN',1],['gurugram','Gurugram','HR',1],['visakhapatnam','Visakhapatnam','AP',1],
 ['itanagar','Itanagar','AR',0],['imphal','Imphal','MN',0],['aizawl','Aizawl','MZ',0],['kohima','Kohima','NL',0],['agartala','Agartala','TR',0],['kavaratti','Kavaratti','LD',0],['daman','Daman','DD',0]
].map(([id,name,state,popular])=>({id,name,state,popular:!!popular}));

/* Sample picks for the trending strip. Not live trend data. */
const TRENDING = ['delhi','mumbai','jaipur','panaji','manali','amritsar','chandigarh','bengaluru','rishikesh'];

const CATS = {cafe:'Food & Cafes',restaurant:'Restaurants',shopping:'Shopping',tourism:'Tourism',gem:'Hidden Gems',adventure:'Adventure',activity:'Activities'};

/* Real landmark NAMES only. Descriptions are generic and unverified. b:0 = budget unknown. */
const LD = 'A well-known place. Sample card: timings, entry fees and details are not verified.';
const LANDMARKS = [
 ['india-gate','India Gate','delhi','tourism',['landmark','photos']],
 ['gateway','Gateway of India','mumbai','tourism',['landmark','photos']],
 ['marine-drive','Marine Drive','mumbai','tourism',['seafront','walk']],
 ['charminar','Charminar','hyderabad','tourism',['landmark','heritage']],
 ['hawa-mahal','Hawa Mahal','jaipur','tourism',['landmark','heritage']],
 ['golden-temple','Golden Temple (Harmandir Sahib)','amritsar','tourism',['heritage','spiritual']],
 ['lalbagh','Lalbagh Botanical Garden','bengaluru','tourism',['garden','walk']],
 ['victoria','Victoria Memorial','kolkata','tourism',['landmark','heritage']],
 ['dashashwamedh','Dashashwamedh Ghat','varanasi','tourism',['ghat','spiritual']],
 ['chaura','Chaura Bazaar','ludhiana','shopping',['market','bargain']],
 ['pavilion','Pavilion Mall','ludhiana','shopping',['mall','brands']],
 ['sarabha','Sarabha Nagar Market','ludhiana','shopping',['boutiques','evening']],
 ['rakhbagh','Rakh Bagh','ludhiana','tourism',['garden','family']],
 ['ghantaghar','Clock Tower (Ghanta Ghar)','ludhiana','tourism',['landmark','photos']]
].map(([id,name,city,cat,tags])=>({id,name,city,cat,tags,b:0,desc:LD}));

/* [category, name, budget 1-3, tags, phrase for description] generated for every city */
const TEMPLATES = [
 ['cafe','Sample Rooftop Cafe',2,['rooftop','coffee','date night'],'an open-air cafe'],
 ['cafe','Sample Book & Brew',1,['quiet','coffee','study'],'a calm reading and coffee corner'],
 ['restaurant','Sample Local Thali House',1,['regional','family','family restaurant'],'a regional meals restaurant'],
 ['restaurant','Sample Fine Dining Room',3,['fine dining','celebration','date night'],'a sit-down restaurant'],
 ['restaurant','Sample Street Food Corner',1,['street food','snacks','friends'],'a street food stall cluster'],
 ['shopping','Sample Local Market',1,['market','bargain'],'a local market'],
 ['shopping','Sample Handicraft Lane',2,['craft','souvenirs'],'a craft and souvenir shopping lane'],
 ['tourism','Sample Heritage Walk Point',1,['heritage','photos'],'a heritage sightseeing stop'],
 ['tourism','Sample City Viewpoint',1,['views','photos'],'a scenic viewpoint'],
 ['gem','Sample Quiet Courtyard',1,['quiet','photos','morning'],'a lesser-known corner locals love'],
 ['adventure','Sample Outdoor Adventure Spot',2,['outdoors','trek'],'an outdoor adventure experience'],
 ['activity','Sample Workshop & Class',2,['workshop','craft'],'a hands-on workshop'],
 ['activity','Sample Evening Hangout',2,['friends','games'],'a hangout spot for friends']
];
const EVENT_T = [['Sample Local Flea Market','a pop-up of local makers and food stalls'],['Sample Open Mic Evening','a community music and poetry night'],['Sample Heritage Walk','a guided walk through older parts of the city'],['Sample Food Festival','a multi-day food event']];

const MOODS = [['Coffee & calm','quiet',36],['Date night','date night',350],['Family day out','family',130],['Street food','street food',18],['Bargain hunting','bargain',14],['Friends night','friends',260]];

/* ---- PHOTOS (Phase 2) ----
   Every photo is a real Unsplash photograph (free under the Unsplash License). Format:
   key: [Unsplash photo id, photographer, alt text, Unsplash page].
   Image URL = https://images.unsplash.com/<id>?fm=jpg&q=70&w=<width>&auto=format&fit=crop
   A key with no entry simply shows the branded gradient, so the site never breaks. */
const U = 'https://unsplash.com/photos/';
const IMG = {
 hawa:   ['photo-1524229648276-e66561fe45a9','Annie Spratt','Hawa Mahal, the pink palace of Jaipur',U+'RugN1OsUwHM'],
 delhi:  ['photo-1538227892230-2d7b46b9cb20','Parij Borgohain','India Gate in New Delhi with visitors gathering around the monument',U+'4gs_u4O8Zho'],
 mumbai: ['photo-1595658658481-d53d3f999875',"Renzo D'souza",'Gateway of India and the Taj Mahal Palace hotel on the Mumbai waterfront',U+'MxabbMSLr_M'],
 goa:    ['photo-1614082242765-7c98ca0f3df3','Sumit Sourav','Colourful beach huts and palm trees on a sandy shore',U+'eSRtxPd9q1c'],
 beach:  ['photo-1582972236019-ea4af5ffe587','Ishvani Hans','A sandy beach beside the ocean with palm trees',U+'xWFL4KNd_2A'],
 manali: ['photo-1640078374440-17125e5f3016','Harshit Mahabale','Snow-covered mountain range with clouds near Manali',U+'Z2n8J-vsZ2A'],
 amritsar:['photo-1721770741557-6950b1e793e8','Gagan Gill','The Golden Temple (Sri Harmandir Sahib) in Amritsar',U+'02PC-OsBFRc'],
 cafe:   ['photo-1514066637891-498034f5a154','Nathan Dumlao','Three cups of coffee on round wooden stools in a cafe',U+'4QaNg9pu3nk'],
 street: ['photo-1723107995020-ecf4e410c4b6','Johan Mouchet','A street vendor cooking food on a grill in Kochi',U+'bLBEa1pyZv4'],
rishikesh:['photo-1712510817140-917938f92e5b','Travel With Enfield','A river flowing through the mountain town of Rishikesh, Uttarakhand',U+'mxoH7NtRJA8'],
 market: ['photo-1770129157442-5f080cacf11c','Giri','Crowded outdoor market with colourful tents and stalls at K R Market, Bengaluru',U+'l-M9fs0pNuQ']
};
/* city id -> photo key (used for destination cards and tourism listings in that city) */
IMG.adventure = IMG.rishikesh; /* Rishikesh is a rafting and trekking hub */
const CITY_IMG = {rishikesh:'rishikesh',delhi:'delhi',mumbai:'mumbai',jaipur:'hawa',panaji:'goa',manali:'manali',amritsar:'amritsar',bengaluru:'market'};
/* real landmark id -> photo key */
const LANDMARK_IMG = {'india-gate':'delhi','gateway':'mumbai','hawa-mahal':'hawa','golden-temple':'amritsar'};
/* category -> illustrative photo key (cards say "illustrative photo") */
const CAT_IMG = {tourism:'hawa',cafe:'cafe',shopping:'market'};
