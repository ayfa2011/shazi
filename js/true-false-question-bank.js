const SOURCES = {
  karnataka: { title: "Karnataka Tourism", url: "https://karnatakatourism.org/en/experiences/heritage-history" },
  mysuru: { title: "Karnataka Tourism · Mysuru Palace", url: "https://karnatakatourism.org/en/attractions/mysuru-palace" },
  hampi: { title: "UNESCO · Group of Monuments at Hampi", url: "https://whc.unesco.org/en/list/241/" },
  pattadakal: { title: "UNESCO · Pattadakal", url: "https://whc.unesco.org/en/list/239/" },
  westernGhats: { title: "UNESCO · Western Ghats", url: "https://whc.unesco.org/en/list/1342/" },
  indiaHeritage: { title: "UNESCO · India World Heritage", url: "https://whc.unesco.org/en/statesparties/in" },
  isro: { title: "ISRO · About", url: "https://www.isro.gov.in/ISRO_EN/profile.html" },
  railways: { title: "Indian Railways · History", url: "https://cr.indianrailways.gov.in/view_section.jsp?backgroundColor=LIGHTSTEELBLUE&fontColor=black&id=0%2C6%2C287%2C384%2C534&lang=0" },
  flag: { title: "Know India · The Indian Tricolour", url: "https://knowindia.india.gov.in/my-india-my-pride/indian-tricolor.php" },
  constitution: { title: "Constitution of India · Making of the Constitution", url: "https://www.constitutionofindia.net/stages-of-constitution-making/" },
  india: { title: "Know India · National Portal of India", url: "https://knowindia.india.gov.in/" },
  culture: { title: "Sangeet Natak Akademi", url: "https://sangeetnatak.gov.in/" },
  indiaCulture: { title: "Ministry of Culture, Government of India", url: "https://indiaculture.gov.in/" }
};

// Original short-form fact pairs. Each incorrect claim is corrected by its explanation.
const FACTS = [
  ["Karnataka", "Bengaluru is the capital of Karnataka.", "Mysuru is the capital of Karnataka.", "Bengaluru is Karnataka’s capital city.", "karnataka"],
  ["Karnataka", "Kannada is the official language of Karnataka.", "Malayalam is the official language of Karnataka.", "Kannada is the official language of Karnataka.", "karnataka"],
  ["Karnataka", "Karnataka was previously known as Mysore State.", "Karnataka was previously known as Travancore State.", "The state was called Mysore State before it was renamed Karnataka in 1973.", "karnataka"],
  ["Karnataka", "The present Karnataka state was formed on 1 November 1956 as Mysore State.", "The present Karnataka state was formed on 1 November 1947 as Mysore State.", "The unified Mysore State was formed on 1 November 1956; it was renamed Karnataka in 1973.", "karnataka"],
  ["Karnataka", "Karnataka’s coastline lies along the Arabian Sea.", "Karnataka’s coastline lies along the Bay of Bengal.", "Karnataka has a western coastline on the Arabian Sea.", "karnataka"],
  ["Karnataka", "Yakshagana is a traditional theatre form associated with coastal Karnataka.", "Yakshagana is a traditional theatre form associated with coastal Gujarat.", "Yakshagana is a vibrant folk theatre tradition of coastal Karnataka.", "karnataka"],
  ["Karnataka", "Vidhana Soudha in Bengaluru houses Karnataka’s legislature.", "Vidhana Soudha in Bengaluru houses Kerala’s legislature.", "Vidhana Soudha is the seat of Karnataka’s legislature in Bengaluru.", "karnataka"],
  ["Karnataka", "Mysuru Dasara is a major festival celebrated in Karnataka.", "Mysuru Dasara is a major festival celebrated in Punjab.", "Mysuru Dasara is one of Karnataka’s best-known annual celebrations.", "mysuru"],
  ["Karnataka", "Mysuru Palace is also known as Amba Vilas Palace.", "Mysuru Palace is also known as Gol Gumbaz.", "Amba Vilas Palace is another name for Mysuru Palace.", "mysuru"],
  ["Karnataka", "The present Mysuru Palace was designed by Henry Irwin.", "The present Mysuru Palace was designed by Edwin Lutyens.", "Architect Henry Irwin designed the present Mysuru Palace.", "mysuru"],
  ["Karnataka", "The present Mysuru Palace is an Indo-Saracenic building.", "The present Mysuru Palace is a Gothic cathedral.", "The palace combines architectural influences in an Indo-Saracenic design.", "mysuru"],
  ["Karnataka", "Mysuru Palace is in the city of Mysuru.", "Mysuru Palace is in the city of Mangaluru.", "Mysuru Palace stands in central Mysuru, Karnataka.", "mysuru"],
  ["Karnataka", "Hampi is in Karnataka.", "Hampi is in Rajasthan.", "The Group of Monuments at Hampi is in central Karnataka.", "hampi"],
  ["Karnataka", "Hampi was the capital city of the Vijayanagara Empire.", "Hampi was the capital city of the Mughal Empire.", "Hampi contains the remains of the capital of the Vijayanagara Empire.", "hampi"],
  ["Karnataka", "The Tungabhadra River flows through the Hampi landscape.", "The Ganga River flows through the Hampi landscape.", "Hampi’s setting is shaped by the Tungabhadra River and rocky hills.", "hampi"],
  ["Karnataka", "Hampi’s Vittala Temple complex includes the famous Stone Chariot.", "Hampi’s Vittala Temple complex includes the famous Iron Chariot.", "The Stone Chariot is a celebrated monument at the Vittala Temple in Hampi.", "karnataka"],
  ["Karnataka", "The Virupaksha Temple is located at Hampi.", "The Virupaksha Temple is located at Jaipur.", "The Virupaksha Temple is one of Hampi’s historic temple complexes.", "hampi"],
  ["Karnataka", "UNESCO added the Group of Monuments at Hampi to its World Heritage List in 1986.", "UNESCO added the Group of Monuments at Hampi to its World Heritage List in 2006.", "Hampi was inscribed as a UNESCO World Heritage property in 1986.", "hampi"],
  ["Karnataka", "Pattadakal is in Karnataka.", "Pattadakal is in Odisha.", "The Group of Monuments at Pattadakal is in Karnataka.", "pattadakal"],
  ["Karnataka", "Pattadakal’s temples blend architectural forms from northern and southern India.", "Pattadakal’s temples blend architectural forms from India and South America.", "UNESCO describes Pattadakal as a harmonious blend of northern and southern Indian architectural forms.", "pattadakal"],
  ["Karnataka", "Pattadakal’s best-known temple group took shape under the Chalukya dynasty.", "Pattadakal’s best-known temple group took shape under the Chola dynasty.", "The Chalukya dynasty oversaw major temple building at Pattadakal in the 7th and 8th centuries.", "pattadakal"],
  ["Karnataka", "UNESCO inscribed the Group of Monuments at Pattadakal in 1987.", "UNESCO inscribed the Group of Monuments at Pattadakal in 1997.", "Pattadakal became a UNESCO World Heritage property in 1987.", "pattadakal"],
  ["Karnataka", "The Hoysaleswara Temple is at Halebidu in Karnataka.", "The Hoysaleswara Temple is at Hampi in Karnataka.", "Halebidu is home to the Hoysaleswara Temple, an important Hoysala monument.", "karnataka"],
  ["Karnataka", "The Chennakesava Temple is at Belur in Karnataka.", "The Chennakesava Temple is at Badami in Karnataka.", "Belur is known for its Hoysala-era Chennakesava Temple.", "karnataka"],
  ["Karnataka", "Badami is known for its rock-cut cave temples.", "Badami is known for its rock-cut lighthouse caves.", "Badami’s historic cave temples are carved into sandstone cliffs.", "karnataka"],
  ["Karnataka", "Aihole is a historic temple town in Karnataka.", "Aihole is a historic temple town in West Bengal.", "Aihole in Karnataka is noted for its early temple architecture.", "karnataka"],
  ["Karnataka", "Gol Gumbaz is in Vijayapura, Karnataka.", "Gol Gumbaz is in Mysuru, Karnataka.", "Gol Gumbaz, the mausoleum of Mohammed Adil Shah, is in Vijayapura.", "karnataka"],
  ["Karnataka", "Udupi is a coastal district of Karnataka.", "Udupi is a coastal district of Maharashtra.", "Udupi lies on Karnataka’s Arabian Sea coast.", "karnataka"],
  ["Karnataka", "Gokarna is a coastal town in Karnataka.", "Gokarna is a coastal town in Andhra Pradesh.", "Gokarna is among the coastal destinations in Karnataka.", "karnataka"],
  ["Karnataka", "Jog Falls is formed by the Sharavathi River.", "Jog Falls is formed by the Kaveri River.", "The Sharavathi River forms Jog Falls in Karnataka.", "karnataka"],
  ["Karnataka", "The Western Ghats run through Karnataka.", "The Western Ghats run through Rajasthan.", "The Western Ghats mountain chain traverses Karnataka and several other western Indian states.", "westernGhats"],
  ["Karnataka", "The Western Ghats are older than the Himalaya mountain chain.", "The Himalaya mountain chain is older than the Western Ghats.", "UNESCO notes that the Western Ghats are older than the Himalaya.", "westernGhats"],
  ["Karnataka", "Coorg is another name commonly used for Kodagu.", "Coorg is another name commonly used for Kolar.", "Coorg is the familiar English name for Kodagu district in Karnataka.", "karnataka"],
  ["Karnataka", "Mysuru is often called the City of Palaces.", "Mysuru is often called the City of Lakes.", "Mysuru is widely known as the City of Palaces.", "mysuru"],
  ["Karnataka", "Mysore Pak is a sweet strongly associated with Mysuru.", "Mysore Pak is a sweet strongly associated with Amritsar.", "Mysore Pak takes its name from Mysuru and is a well-known local sweet.", "mysuru"],
  ["Karnataka", "The Mysuru Palace is lit with thousands of bulbs during its illuminations.", "The Mysuru Palace is lit with thousands of candles during its illuminations.", "Karnataka Tourism describes the palace’s illumination with about 97,000 bulbs.", "mysuru"],
  ["Karnataka", "The Arabian Sea is west of Karnataka.", "The Arabian Sea is east of Karnataka.", "Karnataka’s coast faces west onto the Arabian Sea.", "karnataka"],
  ["Karnataka", "The Krishna River flows through northern Karnataka.", "The Krishna River flows through northern Kerala.", "The Krishna is a major river system that crosses northern Karnataka.", "karnataka"],
  ["Karnataka", "The Kaveri River rises at Talakaveri in Karnataka.", "The Kaveri River rises at Talakaveri in Goa.", "Talakaveri in Kodagu district is traditionally identified as the source of the Kaveri.", "karnataka"],
  ["Karnataka", "Rani Chennamma is remembered for resisting British rule at Kittur.", "Rani Chennamma is remembered for resisting British rule at Jhansi.", "Kittur Rani Chennamma led resistance against British rule in the region of present-day Karnataka.", "karnataka"],
  ["Karnataka", "The Vijayanagara Empire had its capital at Hampi.", "The Vijayanagara Empire had its capital at Madurai.", "Hampi preserves remains of Vijayanagara’s capital city.", "hampi"],
  ["Karnataka", "The Sacred Ensembles of the Hoysalas are in Karnataka.", "The Sacred Ensembles of the Hoysalas are in Kerala.", "UNESCO’s Hoysala World Heritage property includes monuments in Karnataka.", "indiaHeritage"],
  ["Karnataka", "Belur and Halebidu are associated with Hoysala architecture.", "Belur and Halebidu are associated with Mughal architecture.", "Belur and Halebidu are celebrated for Hoysala temple architecture.", "karnataka"],
  ["Karnataka", "Mangaluru is a port city on Karnataka’s west coast.", "Mangaluru is a port city on Karnataka’s east coast.", "Mangaluru lies on Karnataka’s Arabian Sea coast.", "karnataka"],
  ["Karnataka", "Bengaluru is the headquarters of ISRO.", "Mumbai is the headquarters of ISRO.", "ISRO’s headquarters are at Antariksh Bhavan in Bengaluru.", "isro"],
  ["Indian space", "ISRO was established in 1969.", "ISRO was established in 1979.", "ISRO’s official profile gives its establishment year as 1969.", "isro"],
  ["Indian space", "Aryabhata was India’s first satellite.", "Aryabhata was India’s first crewed spacecraft.", "Aryabhata was India’s first satellite, launched in 1975.", "isro"],
  ["Indian space", "Aryabhata was launched in 1975.", "Aryabhata was launched in 1985.", "India’s first satellite, Aryabhata, was launched in 1975.", "isro"],
  ["Indian space", "The Polar Satellite Launch Vehicle is commonly abbreviated PSLV.", "The Polar Satellite Launch Vehicle is commonly abbreviated PLSV.", "PSLV is the abbreviation for Polar Satellite Launch Vehicle.", "isro"],
  ["Indian space", "Chandrayaan-1 was India’s first lunar mission.", "Chandrayaan-1 was India’s first mission to Mars.", "Chandrayaan-1 was India’s first mission to the Moon.", "isro"],
  ["Indian space", "Chandrayaan-1 launched in 2008.", "Chandrayaan-1 launched in 2018.", "ISRO launched Chandrayaan-1 in 2008.", "isro"],
  ["Indian space", "Chandrayaan-3 made a soft landing on the Moon in 2023.", "Chandrayaan-3 made a soft landing on Mars in 2023.", "India’s Chandrayaan-3 mission achieved a lunar soft landing in August 2023.", "isro"],
  ["Indian space", "Chandrayaan-3 landed near the Moon’s south polar region.", "Chandrayaan-3 landed near the Moon’s north polar region.", "Chandrayaan-3 landed in the Moon’s southern polar region, a historic first for a spacecraft.", "isro"],
  ["Indian space", "Mangalyaan was India’s Mars Orbiter Mission.", "Mangalyaan was India’s Venus Orbiter Mission.", "Mangalyaan is the popular name for India’s Mars Orbiter Mission.", "isro"],
  ["Indian space", "Vikram Sarabhai is regarded as a founder of India’s space programme.", "Vikram Sarabhai is regarded as a founder of India’s railway network.", "ISRO recognizes Vikram Sarabhai’s foundational role in India’s space programme.", "isro"],
  ["Indian space", "Sriharikota is the site of India’s main spaceport, Satish Dhawan Space Centre.", "Bengaluru is the site of India’s main spaceport, Satish Dhawan Space Centre.", "Satish Dhawan Space Centre, India’s major launch site, is at Sriharikota in Andhra Pradesh.", "isro"],
  ["Indian space", "India’s first satellite Aryabhata was named after an ancient Indian scholar.", "India’s first satellite Aryabhata was named after a Mughal emperor.", "Aryabhata was named after the ancient Indian scholar Aryabhata.", "isro"],
  ["Indian space", "The Indian Space Research Organisation is abbreviated ISRO.", "The Indian Space Research Organisation is abbreviated IRO.", "ISRO stands for Indian Space Research Organisation.", "isro"],
  ["Indian space", "India’s space programme operates under the Department of Space.", "India’s space programme operates under the Ministry of Railways.", "The Department of Space oversees India’s national space programme and ISRO.", "isro"],
  ["Indian space", "The first Indian satellite was launched by a Soviet launch vehicle.", "The first Indian satellite was launched by a Japanese launch vehicle.", "Aryabhata was launched from the Soviet Union using a Soviet launch vehicle.", "isro"],
  ["Indian history", "India’s first passenger train ran from Mumbai to Thane.", "India’s first passenger train ran from Mumbai to Pune.", "The first passenger train in India ran between Mumbai and Thane.", "railways"],
  ["Indian history", "India’s first passenger train ran in 1853.", "India’s first passenger train ran in 1863.", "The first passenger train ran on 16 April 1853.", "railways"],
  ["Indian history", "The first Indian passenger train departed from Boribunder in Mumbai.", "The first Indian passenger train departed from Howrah in Kolkata.", "The 1853 first passenger train began its journey at Boribunder in Mumbai.", "railways"],
  ["Indian history", "India became independent on 15 August 1947.", "India became independent on 15 August 1948.", "India’s Independence Day marks 15 August 1947.", "india"],
  ["Indian history", "Mahatma Gandhi led the Salt March to Dandi.", "Mahatma Gandhi led the Salt March to Agra.", "Gandhi led the 1930 Salt March from Sabarmati to Dandi in Gujarat.", "india"],
  ["Indian history", "The Dandi March was a protest against the British salt tax.", "The Dandi March was a protest against the British railway tax.", "The Salt March challenged British restrictions and taxation on salt.", "india"],
  ["Indian history", "The Quit India Movement began in 1942.", "The Quit India Movement began in 1932.", "The Quit India Movement was launched in August 1942.", "india"],
  ["Indian history", "The Jallianwala Bagh massacre took place in Amritsar.", "The Jallianwala Bagh massacre took place in Lucknow.", "The 1919 Jallianwala Bagh massacre occurred in Amritsar, Punjab.", "india"],
  ["Indian history", "The Indian National Congress was founded in 1885.", "The Indian National Congress was founded in 1895.", "The Indian National Congress held its first session in 1885.", "india"],
  ["Indian history", "Rabindranath Tagore wrote the words of Jana Gana Mana.", "Bankim Chandra Chatterjee wrote the words of Jana Gana Mana.", "Rabindranath Tagore wrote India’s national anthem, Jana Gana Mana.", "india"],
  ["Indian history", "Bankim Chandra Chatterjee wrote Vande Mataram.", "Rabindranath Tagore wrote Vande Mataram.", "Vande Mataram was composed by Bankim Chandra Chatterjee.", "india"],
  ["Indian history", "The Constitution of India was adopted on 26 November 1949.", "The Constitution of India was adopted on 26 November 1950.", "The Constituent Assembly adopted the Constitution on 26 November 1949.", "constitution"],
  ["Indian history", "The Constitution of India came into effect on 26 January 1950.", "The Constitution of India came into effect on 26 January 1949.", "The Constitution came into force on 26 January 1950, now observed as Republic Day.", "constitution"],
  ["Indian history", "India’s first President was Dr Rajendra Prasad.", "India’s first President was Dr Sarvepalli Radhakrishnan.", "Dr Rajendra Prasad served as the first President of India.", "india"],
  ["Indian history", "Jawaharlal Nehru was India’s first Prime Minister.", "Sardar Vallabhbhai Patel was India’s first Prime Minister.", "Jawaharlal Nehru became independent India’s first Prime Minister.", "india"],
  ["Indian history", "The Jallianwala Bagh memorial is in Punjab.", "The Jallianwala Bagh memorial is in Gujarat.", "Jallianwala Bagh is a memorial site in Amritsar, Punjab.", "india"],
  ["Indian history", "The Indian National Army is associated with Subhas Chandra Bose.", "The Indian National Army is associated with Dadabhai Naoroji.", "Subhas Chandra Bose is closely associated with the Indian National Army.", "india"],
  ["Indian history", "The first session of the Indian National Congress was held in Bombay.", "The first session of the Indian National Congress was held in Delhi.", "The Congress held its first session in Bombay in 1885.", "india"],
  ["Indian history", "The 1857 uprising began in Meerut.", "The 1857 uprising began in Chennai.", "The uprising of 1857 began at Meerut before spreading to other places.", "india"],
  ["Indian history", "The capital of British India moved from Calcutta to Delhi in 1911.", "The capital of British India moved from Calcutta to Mumbai in 1911.", "The 1911 announcement shifted the capital from Calcutta to Delhi.", "india"],
  ["Indian flag", "India’s national flag was adopted in its present form on 22 July 1947.", "India’s national flag was adopted in its present form on 22 July 1957.", "The Constituent Assembly adopted the present tricolour on 22 July 1947.", "flag"],
  ["Indian flag", "The Ashoka Chakra on India’s national flag has 24 spokes.", "The Ashoka Chakra on India’s national flag has 12 spokes.", "The navy-blue Ashoka Chakra at the centre of the flag has 24 spokes.", "flag"],
  ["Indian flag", "The top stripe of India’s national flag is saffron.", "The top stripe of India’s national flag is green.", "The Indian tricolour has saffron at the top, white in the middle, and green at the bottom.", "flag"],
  ["Indian flag", "The Ashoka Chakra design comes from the Lion Capital of Sarnath.", "The Ashoka Chakra design comes from the Gateway of India.", "The flag’s Chakra is based on the wheel shown on the Sarnath Lion Capital.", "flag"],
  ["Indian geography", "The Bay of Bengal lies east of mainland India.", "The Bay of Bengal lies west of mainland India.", "The Bay of Bengal borders India on the east.", "india"],
  ["Indian geography", "The Arabian Sea lies west of mainland India.", "The Arabian Sea lies east of mainland India.", "The Arabian Sea borders India on the west.", "india"],
  ["Indian geography", "The Andaman and Nicobar Islands are in the Bay of Bengal.", "The Andaman and Nicobar Islands are in the Arabian Sea.", "India’s Andaman and Nicobar Islands are in the Bay of Bengal.", "india"],
  ["Indian geography", "Lakshadweep is in the Arabian Sea.", "Lakshadweep is in the Bay of Bengal.", "Lakshadweep is an island group in the Arabian Sea.", "india"],
  ["Indian geography", "The Tropic of Cancer passes through India.", "The Tropic of Capricorn passes through India.", "The Tropic of Cancer crosses central India.", "india"],
  ["Indian geography", "The Himalaya mountain range lies along northern India.", "The Himalaya mountain range lies along southern India.", "The Himalaya form a major mountain boundary along northern India.", "india"],
  ["Indian geography", "The Ganga empties into the Bay of Bengal.", "The Ganga empties into the Arabian Sea.", "The Ganga river system flows east to the Bay of Bengal.", "india"],
  ["Indian geography", "The Brahmaputra enters India through Arunachal Pradesh.", "The Brahmaputra enters India through Gujarat.", "The Brahmaputra enters India in the eastern Himalaya region of Arunachal Pradesh.", "india"],
  ["Indian geography", "The Narmada River flows westward to the Arabian Sea.", "The Narmada River flows eastward to the Bay of Bengal.", "The Narmada flows west through central India and reaches the Arabian Sea.", "india"],
  ["Indian geography", "The Sardar Sarovar Dam is on the Narmada River.", "The Sardar Sarovar Dam is on the Ganga River.", "Sardar Sarovar is a major dam built on the Narmada in Gujarat.", "india"],
  ["Indian geography", "The Thar Desert is mainly in Rajasthan.", "The Thar Desert is mainly in Assam.", "Most of India’s Thar Desert lies in Rajasthan.", "india"],
  ["Indian geography", "The Sundarbans region lies in West Bengal and Bangladesh.", "The Sundarbans region lies in Punjab and Pakistan.", "The Sundarbans mangrove region spans the Ganges delta in India and Bangladesh.", "india"],
  ["Indian geography", "The Western Ghats run parallel to India’s western coast.", "The Western Ghats run parallel to India’s eastern coast.", "UNESCO describes the Western Ghats as running parallel to India’s western coast.", "westernGhats"],
  ["Indian geography", "The Palghat Gap is a break in the Western Ghats between Kerala and Tamil Nadu.", "The Palghat Gap is a break in the Himalaya between Nepal and Bhutan.", "The Palghat Gap is a low pass in the Western Ghats between Kerala and Tamil Nadu.", "westernGhats"],
  ["Indian landmarks", "The Taj Mahal is in Agra, Uttar Pradesh.", "The Taj Mahal is in Jaipur, Rajasthan.", "The Taj Mahal stands in Agra on the Yamuna River.", "indiaHeritage"],
  ["Indian landmarks", "The Taj Mahal was commissioned by Mughal emperor Shah Jahan.", "The Taj Mahal was commissioned by Mughal emperor Akbar.", "Shah Jahan commissioned the Taj Mahal in memory of Mumtaz Mahal.", "indiaHeritage"],
  ["Indian landmarks", "The Red Fort is in Delhi.", "The Red Fort is in Bhopal.", "Delhi’s Red Fort was built during the Mughal period.", "indiaHeritage"],
  ["Indian landmarks", "Qutb Minar is in Delhi.", "Qutb Minar is in Hyderabad.", "The Qutb Minar complex is a historic site in Delhi.", "indiaHeritage"],
  ["Indian landmarks", "The Sun Temple at Konark is in Odisha.", "The Sun Temple at Konark is in Karnataka.", "Konark’s famous Sun Temple is in Odisha.", "indiaHeritage"],
  ["Indian landmarks", "The Ajanta Caves are in Maharashtra.", "The Ajanta Caves are in Bihar.", "The Ajanta Caves are in Maharashtra’s Aurangabad region.", "indiaHeritage"],
  ["Indian landmarks", "The Ellora Caves are in Maharashtra.", "The Ellora Caves are in Tamil Nadu.", "Ellora is a celebrated cave complex in Maharashtra.", "indiaHeritage"],
  ["Indian landmarks", "Dholavira is an archaeological site in Gujarat.", "Dholavira is an archaeological site in Kerala.", "The Harappan city of Dholavira is on Khadir island in Gujarat.", "indiaHeritage"],
  ["Indian landmarks", "Rani-ki-Vav is a historic stepwell in Gujarat.", "Rani-ki-Vav is a historic stepwell in Rajasthan.", "Rani-ki-Vav is at Patan in Gujarat.", "indiaHeritage"],
  ["Indian landmarks", "The Great Stupa at Sanchi is in Madhya Pradesh.", "The Great Stupa at Sanchi is in Andhra Pradesh.", "Sanchi’s Buddhist monuments are in Madhya Pradesh.", "indiaHeritage"],
  ["Indian landmarks", "The Khajuraho Group of Monuments is in Madhya Pradesh.", "The Khajuraho Group of Monuments is in Maharashtra.", "Khajuraho’s historic temples are in Madhya Pradesh.", "indiaHeritage"],
  ["Indian landmarks", "The ancient Nalanda site is in Bihar.", "The ancient Nalanda site is in Gujarat.", "The archaeological remains of Nalanda Mahavihara are in Bihar.", "indiaHeritage"],
  ["Indian landmarks", "The Group of Monuments at Mahabalipuram is in Tamil Nadu.", "The Group of Monuments at Mahabalipuram is in Odisha.", "Mahabalipuram’s shore-side monuments are in Tamil Nadu.", "indiaHeritage"],
  ["Indian landmarks", "Ramappa Temple is in Telangana.", "Ramappa Temple is in Karnataka.", "The Kakatiya Rudreshwara (Ramappa) Temple is in Telangana.", "indiaHeritage"],
  ["Indian landmarks", "The Gateway of India is in Mumbai.", "The Gateway of India is in Chennai.", "The Gateway of India is a landmark on Mumbai’s waterfront.", "india"],
  ["Indian landmarks", "The Charminar is in Hyderabad.", "The Charminar is in Bengaluru.", "Hyderabad’s Charminar is a landmark of the old city.", "india"],
  ["Indian landmarks", "Hawa Mahal is in Jaipur.", "Hawa Mahal is in Lucknow.", "The Hawa Mahal, or Palace of Winds, is in Jaipur, Rajasthan.", "india"],
  ["Indian landmarks", "The Jantar Mantar World Heritage property is in Jaipur.", "The Jantar Mantar World Heritage property is in Patna.", "The UNESCO-listed Jantar Mantar observatory is in Jaipur.", "indiaHeritage"],
  ["Indian landmarks", "India Gate is in New Delhi.", "India Gate is in Kolkata.", "India Gate stands in New Delhi as a war memorial.", "india"],
  ["Indian landmarks", "The Howrah Bridge crosses the Hooghly River in Kolkata.", "The Howrah Bridge crosses the Yamuna River in Delhi.", "Howrah Bridge connects Kolkata and Howrah across the Hooghly River.", "india"],
  ["Indian landmarks", "The Statue of Unity is in Gujarat.", "The Statue of Unity is in Rajasthan.", "The Statue of Unity stands near Kevadia in Gujarat.", "india"],
  ["Indian landmarks", "The Statue of Unity honours Sardar Vallabhbhai Patel.", "The Statue of Unity honours Jawaharlal Nehru.", "The Statue of Unity is a monument to Sardar Vallabhbhai Patel.", "india"],
  ["Indian arts", "Bharatanatyam is a classical dance tradition associated with Tamil Nadu.", "Bharatanatyam is a classical dance tradition associated with Assam.", "Bharatanatyam developed in Tamil Nadu and is one of India’s classical dance forms.", "culture"],
  ["Indian arts", "Kathakali is a classical dance-drama tradition from Kerala.", "Kathakali is a classical dance-drama tradition from Gujarat.", "Kathakali is a Kerala dance-drama known for expressive performance and elaborate costume.", "culture"],
  ["Indian arts", "Kuchipudi is a classical dance tradition from Andhra Pradesh.", "Kuchipudi is a classical dance tradition from Punjab.", "Kuchipudi takes its name from a village in Andhra Pradesh.", "culture"],
  ["Indian arts", "Odissi is a classical dance tradition from Odisha.", "Odissi is a classical dance tradition from Rajasthan.", "Odissi is the classical dance form associated with Odisha.", "culture"],
  ["Indian arts", "Sattriya is a classical dance tradition from Assam.", "Sattriya is a classical dance tradition from Goa.", "Sattriya developed in Assam’s monasteries, known as satras.", "culture"],
  ["Indian arts", "Manipuri is a classical dance tradition from Manipur.", "Manipuri is a classical dance tradition from Maharashtra.", "Manipuri is the classical dance form associated with Manipur.", "culture"],
  ["Indian arts", "Mohiniyattam is a classical dance tradition from Kerala.", "Mohiniyattam is a classical dance tradition from Haryana.", "Mohiniyattam is a classical dance form from Kerala.", "culture"],
  ["Indian arts", "Garba is a folk dance tradition associated with Gujarat.", "Garba is a folk dance tradition associated with Himachal Pradesh.", "Garba is widely performed in Gujarat, especially during Navratri.", "culture"],
  ["Indian arts", "Bihu is a festival and dance tradition associated with Assam.", "Bihu is a festival and dance tradition associated with Kerala.", "Bihu is a major seasonal celebration of Assam, with its own dance tradition.", "culture"],
  ["Indian arts", "Onam is a major annual festival celebrated in Kerala.", "Onam is a major annual festival celebrated in Punjab.", "Onam is Kerala’s best-known harvest-season festival.", "culture"],
  ["Indian arts", "Pongal is a harvest festival celebrated in Tamil Nadu.", "Pongal is a harvest festival celebrated in Himachal Pradesh.", "Pongal is a major harvest celebration in Tamil Nadu.", "culture"],
  ["Indian arts", "Durga Puja is especially prominent in West Bengal.", "Durga Puja is especially prominent in Goa.", "Durga Puja is widely celebrated in West Bengal, particularly in Kolkata.", "culture"],
  ["Indian arts", "Lavani is a performance tradition associated with Maharashtra.", "Lavani is a performance tradition associated with Sikkim.", "Lavani is a popular song-and-dance tradition of Maharashtra.", "culture"],
  ["Indian arts", "The sitar is a plucked string instrument used in Indian classical music.", "The sitar is a brass wind instrument used in Indian classical music.", "The sitar is a long-necked plucked string instrument.", "culture"],
  ["Indian arts", "The tabla is a pair of hand-played drums.", "The tabla is a bowed string instrument.", "Tabla is a percussion instrument consisting of two hand-played drums.", "culture"],
  ["Indian arts", "The veena is a string instrument with a long history in Indian music.", "The veena is a wind instrument with a long history in Indian music.", "The veena is a family of plucked string instruments used in Indian music.", "culture"],
  ["Indian arts", "Madhubani painting is associated with Bihar.", "Madhubani painting is associated with Goa.", "Madhubani or Mithila painting originated in the Mithila region of Bihar.", "indiaCulture"],
  ["Indian arts", "Warli painting is associated with Maharashtra.", "Warli painting is associated with Punjab.", "Warli is a traditional painting style of Maharashtra’s tribal communities.", "indiaCulture"],
  ["Indian arts", "Pattachitra is a traditional painting style associated with Odisha.", "Pattachitra is a traditional painting style associated with Nagaland.", "Odisha is known for its Pattachitra painting tradition.", "indiaCulture"],
  ["Indian arts", "Chikankari embroidery is strongly associated with Lucknow.", "Chikankari embroidery is strongly associated with Kochi.", "Lucknow is famous for its fine Chikankari embroidery.", "indiaCulture"],
  ["Indian arts", "The Kumbh Mela is a major pilgrimage gathering in India.", "The Kumbh Mela is a major pilgrimage gathering in Japan.", "Kumbh Mela is a large Hindu pilgrimage gathering held at rotating Indian sites.", "india"],
  ["Indian arts", "The Konark Sun Temple is designed in the form of a monumental chariot.", "The Konark Sun Temple is designed in the form of a monumental ship.", "The Sun Temple at Konark is conceived as the chariot of the Sun God.", "indiaHeritage"],
  ["Indian arts", "The Ashoka Pillar capital at Sarnath inspired India’s state emblem.", "The Gateway of India inspired India’s state emblem.", "India’s state emblem is based on the Lion Capital of Ashoka at Sarnath.", "india"],
  ["Indian culture", "Hindi and English are used for official purposes of the Union of India.", "Kannada and Tamil are the only languages used for official purposes of the Union of India.", "The Union’s official-language arrangements include Hindi and English under law.", "india"],
  ["Indian culture", "India’s national anthem is Jana Gana Mana.", "India’s national anthem is Vande Mataram.", "Jana Gana Mana is India’s national anthem; Vande Mataram is the national song.", "india"],
  ["Indian culture", "India’s national song is Vande Mataram.", "India’s national song is Saare Jahan Se Achha.", "Vande Mataram is India’s national song, composed by Bankim Chandra Chatterjee.", "india"],
  ["Indian culture", "Republic Day in India is observed on 26 January.", "Republic Day in India is observed on 15 August.", "Republic Day marks the Constitution coming into effect on 26 January 1950.", "constitution"],
  ["Indian culture", "India celebrates Independence Day on 15 August.", "India celebrates Independence Day on 26 January.", "India’s Independence Day is observed each year on 15 August.", "india"],
  ["Indian culture", "Constitution Day in India is observed on 26 November.", "Constitution Day in India is observed on 26 December.", "Constitution Day commemorates the adoption of the Constitution on 26 November 1949.", "constitution"],
  ["Indian culture", "India’s Parliament is in New Delhi.", "India’s Parliament is in Bengaluru.", "The Parliament of India is located in the national capital, New Delhi.", "india"],
  ["Indian culture", "The Supreme Court of India is in New Delhi.", "The Supreme Court of India is in Mumbai.", "The Supreme Court of India is seated in New Delhi.", "india"],
  ["Indian culture", "The Reserve Bank of India is India’s central bank.", "The Supreme Court of India is India’s central bank.", "The Reserve Bank of India is India’s central bank.", "india"],
  ["Indian culture", "The Ashoka Chakra is navy blue on India’s national flag.", "The Ashoka Chakra is bright red on India’s national flag.", "The flag’s central Ashoka Chakra is navy blue.", "flag"],
  ["Indian culture", "The white stripe of India’s flag is between the saffron and green stripes.", "The green stripe of India’s flag is between the saffron and white stripes.", "The tricolour’s white band is in the middle, between saffron and green.", "flag"],
  ["Indian culture", "The national flag of India is a horizontal tricolour.", "The national flag of India is a vertical tricolour.", "India’s flag has three horizontal bands of saffron, white, and green.", "flag"]
];

function takeFacts(category, count) {
  const matchingFacts = FACTS.filter(fact => fact[0] === category);
  if (matchingFacts.length < count) throw new Error(`Not enough ${category} facts to build the bank.`);
  return matchingFacts.slice(0, count);
}

const BANK_FACTS = [
  ...takeFacts("Karnataka", 30),
  ...takeFacts("Indian space", 12),
  ...takeFacts("Indian history", 18),
  ...takeFacts("Indian flag", 4),
  ...takeFacts("Indian geography", 13),
  ...takeFacts("Indian landmarks", 12),
  ...takeFacts("Indian arts", 6),
  ...takeFacts("Indian culture", 5)
];

const QUESTION_FORMS = [
  claim => `True or false: ${claim}`,
  claim => `Fact check: ${claim}`,
  claim => `Is this statement accurate? ${claim}`,
  claim => `Take a guess: ${claim}`,
  claim => `Quick fact check: ${claim}`
];

export const TRUE_FALSE_BANK_VERSION = 1;
export const TRUE_FALSE_QUESTION_BANK = BANK_FACTS.flatMap(([category, trueClaim, falseClaim, explanation, sourceKey], factIndex) => {
  const source = SOURCES[sourceKey];
  return [trueClaim, falseClaim].flatMap((statement, polarityIndex) => QUESTION_FORMS.map((format, formIndex) => ({
    id: `tf-${String(factIndex + 1).padStart(3, "0")}-${polarityIndex ? "f" : "t"}-${formIndex + 1}`,
    factId: factIndex + 1,
    category,
    statement,
    answer: polarityIndex === 0,
    explanation,
    sourceTitle: source.title,
    sourceUrl: source.url
  })));
});

if (BANK_FACTS.length !== 100 || TRUE_FALSE_QUESTION_BANK.length !== 1000) {
  throw new Error("The True or False question bank must contain exactly 1,000 entries from 100 facts.");
}

export function pickTrueFalseQuestions(bank, count = 12) {
  const byFact = new Map();
  for (const question of bank) {
    const variants = byFact.get(question.factId) || [];
    variants.push(question);
    byFact.set(question.factId, variants);
  }
  const factIds = [...byFact.keys()];
  for (let index = factIds.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [factIds[index], factIds[swapIndex]] = [factIds[swapIndex], factIds[index]];
  }
  return factIds.slice(0, Math.min(count, factIds.length)).map(factId => {
    const variants = byFact.get(factId);
    return variants[Math.floor(Math.random() * variants.length)];
  });
}
