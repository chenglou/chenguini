/*
Comments crawled from HN comments page

var a = [...document.querySelectorAll('.athing.comtr')]
a.map(node => {
  let comment = node.querySelector('.commtext')
  let reply = comment.querySelector('.reply')
  if (reply) comment.removeChild(reply)

  return {
  	indent: parseInt(node.querySelector('.ind').getAttribute('indent')),
  	user: node.querySelector('.hnuser').innerText,
  	age: node.querySelector('.age a').innerText,
  	comment: node.querySelector('.commtext').innerHTML
  }
})

Big thread: try https://news.ycombinator.com/item?id=25706993
*/

export type HNComment = {
  indent: number
  user: string
  age: string
  comment: string
}

export type HNThread = {
  title: string
  link: string
  points: number
  submitter: string
  submissionDate: string
  comments: HNComment[]
}

export let dataRaw: HNThread[] = [
	{
    title: 'Steve Jobs has passed away.',
  	link: 'apple.com',
  	points: 4338,
  	submitter: 'patricktomas',
  	submissionDate: 'Oct 5, 2011',
    comments: [
      {
        "indent": 0,
        "user": "donohoe",
        "age": "on Oct 5, 2011",
        "comment": "\"Remembering that I'll be dead soon is the most important tool I've ever encountered to help me make the big choices in life. Because almost everything — all external expectations, all pride, all fear of embarrassment or failure - these things just fall away in the face of death, leaving only what is truly important. Remembering that you are going to die is the best way I know to avoid the trap of thinking you have something to lose. You are already naked. There is no reason not to follow your heart.\"<p>June 12th 2005 Stanford commencement speech</p><p>Text: <a href=\"http://news.stanford.edu/news/2005/june15/jobs-061505.html\" rel=\"nofollow\">http://news.stanford.edu/news/2005/june15/jobs-061505.html</a></p><p>Video: <a href=\"http://www.youtube.com/watch?v=UF8uR6Z6KLc\" rel=\"nofollow\">http://www.youtube.com/watch?v=UF8uR6Z6KLc</a>\n              </p>"
      },
      {
        "indent": 1,
        "user": "wyclif",
        "age": "on Oct 6, 2011",
        "comment": "\"Just over two centuries ago, in 1805, it took news of the Battle of Trafalgar over a fortnight to reach London from the Mediterranean. The fact that, in 2011, the speed with which the news of Steve Jobs's death circled the globe and reached millions could be measured in seconds is a profound testimony to the connective power of the new world that he helped to create.\" ~ Alastair Roberts"
      },
      {
        "indent": 2,
        "user": "narag",
        "age": "on Oct 6, 2011",
        "comment": "Trafalgar is not far from the Mediterranean, but it's in the Atlantic,"
      },
      {
        "indent": 1,
        "user": "Casc",
        "age": "on Oct 6, 2011",
        "comment": "I knew after he stepped down it wouldn't be long.  Guys like that don't stay still, they're too busy making a dent in the universe.<p>Not sure about anyone else, but the quote above does a lot for me, no matter how many times I've reread it.\n              </p>"
      },
      {
        "indent": 1,
        "user": "daveungerer",
        "age": "on Oct 6, 2011",
        "comment": "Now I realise why this news is so sad to me.  You see, I watched that speech at a time when I didn't know what to do with my life and career.  He's the one who inspired me to finally quit my job and do the \"foolish\" thing.  It's not about the products he created, it's the person he was."
      },
      {
        "indent": 2,
        "user": "jayfuerstenberg",
        "age": "on Oct 6, 2011",
        "comment": "I just re-watched that speech and it was enough to make me realize I'm not foolish enough.  Jobs lived more than many people who reach age 70 because of this foolishness."
      },
      {
        "indent": 1,
        "user": "nordsieck",
        "age": "on Oct 6, 2011",
        "comment": "\"Quem Metui Moritura\"<p>AEneid, iv. 604.</p><p>What need have I to fear--so soon to die?\nLet me work on, not watch and wait in dread:\nWhat will it matter, when that I am dead\nThat they bore hate or love that near me lie?\n'Tis but a lifetime, and the end is nigh\nAt best or worst. Let me lift up my head\nAnd firmly, as with inner courage, tread\nMine own appointed way on mandates high.\nPain could but bring from all its evil store,\nThe close of pain: hate's venom could but kill;\nRepulse, defeat, desertion, could no more,\nLet me have lived my life, not cowered until\nThe unhindered and unchastened hour was here.\nSo soon--what is there now for me to fear?</p><p>-- Edward Rowland Sill\n              </p>"
      },
      {
        "indent": 1,
        "user": "abrimo",
        "age": "on Oct 6, 2011",
        "comment": "I love that speech, back in the early 80s he spoke to the Academy of Achievement which was also great to listen too:\n<a href=\"http://www.achievement.org/autodoc/pagegen/brochure/p3.html\" rel=\"nofollow\">http://www.achievement.org/autodoc/pagegen/brochure/p3.html</a> (search for steve jobs)"
      },
      {
        "indent": 1,
        "user": "cies",
        "age": "on Oct 6, 2011",
        "comment": "i wanted to link to that speech as well.<p>while the tech scene will miss him a lot, my thoughts go to his family who'll miss him most.\n              </p>"
      },
      {
        "indent": 2,
        "user": "chugger",
        "age": "on Oct 6, 2011",
        "comment": "Steve's Most Enduring Legacy: inspiring generations of entrepreneurs, artists, etc. to \"think different\".<p>Right now, theres someone working on his own startup in their garage because he was inspired by Steve Jobs.\n              </p>"
      },
      {
        "indent": 3,
        "user": "keeptrying",
        "age": "on Oct 6, 2011",
        "comment": "Me too.<p>When I heard that commencement speech he gave, I just got the idea that he sincerely meant everything that he said. In a way that someone would when they were talking to you one on one. He had lived everything that he talked about.</p><p>And that speech is a big reason that I have made the leap into doing something on my own.</p><p>RIP Steve.\n              </p>"
      },
      {
        "indent": 3,
        "user": "veyron",
        "age": "on Oct 6, 2011",
        "comment": "Me, although it's my parents basement and not a garage.  And I have the Gandhi poster framed, which I snagged when my school considered disposing those posters ..."
      },
      {
        "indent": 3,
        "user": "nirvana",
        "age": "on Oct 6, 2011",
        "comment": "Me. Right this moment, I'm in my parents house, where our little startup has moved (temporarily!) to create our MVP.<p>When I was a kid, my mother went back to college to finish the degree she'd abandoned when she got married.  She decided to study computer science. This was my first exposure to boolean algebra, and made me want a computer.  The Apple II was relatively new and visicalc was driving sales of it, and I wanted an Apple II so bad that I vowed that, if we couldn't afford one, by golly I was going to make one!  I started learning electronics, I started learning circuit design, I followed a series of articles in Byte Magazine by Steve Ciarcia titled \"build your own computer\".  I built my own computer.  I laid out the PCB, and manufactured it, I stocked it, I designed a video card (using discrete chips, not one of the \"video cards in a chip\" choices that came out later.)</p><p>But pretty quickly, I realized that I needed to learn how to program it.  I needed to learn assembly and to build an operating system, and so I put the computer hardware project on hold and started learning software.</p><p>When I went to college, I wanted to study EE (still in the hardware mode) but pretty soon ended up getting a job as a programmer for a <i>small</i> company.  I liked the small company atmosphere, and that got me hooked on startups.  So, I started my career (dropped out of college, like Steve) and worked for a bunch of startups so that I'd know what I needed to know before starting my own.</p><p>Along the way, I started dozens of small businesses.  I read everything Guy Kawasaki published. I followed Apple news religiously, even in the days prior to the internet. I eventually was able to afford a Macintosh and have been using them for about 20 years now.  I decided that design was important because I came to understand the Mac UI was designed. I read every crappy, money-grubbing, two-bit biography of Steve Jobs I could get my hands on.</p><p>I've never considered him to be a religious figure.  I'm not a cultist.  I don't worship him.  In fact, as was recently revealed by Wozniak, Jobs was an admirer of Atlas Shrugged, as am I.  Worship is the rejection of rationality, and rationality is what we both strived for.</p><p>As I work to build a brand new company now, having just filed the incorporation papers, I am conscious of the lessons Steve Jobs taught me.</p><p>They are not that you should make things pretty, or that marketing is more important than substance... quite the opposite.</p><p>Steve Jobs was a man of integrity.  In this day and age, that is so very rare.</p><p>Apple is a company that has always done its best to do right by its customers, even when its customers didn't know what the right thing was. (Eg: nobody needed a GUI, a laser printer, built in networking, 72dpi, or 300+ dpi displays, the iPad, or a touch interface, or any of hundreds of other things that didn't exit on the market before Apple invented them.)</p><p>Steve Jobs has often been characterized as mean tempered, but I think that he is a kind person.  All of the direct experiences I've had with him, he was vey kind.  What other thing can it be than kindness that would drive someone to sacrifice nearly everything else in order to make a better experience for customers?   The \"missing\" features on Apple products, especially in the 1.0 versions, are legion.</p><p>I think I'm feeling great pain right now, not because I'm an acolyte in the cult of mac, but because one of the few legitimate heroes of our age has died.</p><p>Steve Jobs was an unapologetic capitalist.  He recognized that by making great products, he'd improve people's lives, and as a result, he'd improve his own.</p><p>He was diagnosed with pancreatic cancer in 2003.  The prognosis is not good there, and so he knew he had limited time left.  At that point he was a multi-millionaire if not already a billionaire.</p><p>How did he spend the last 8 years of his life?   Enjoying himself?  No.  He drove himself and Apple to build the next generation of the personal computer.  The iPad is as significant as the Apple II.</p><p>When he was a kid, Steve Jobs gave us the personal computer.  When he was dying, he gave us the next generation of computing.</p><p>I can think of nothing more heroic, than the positive impact on billions of people that will have...</p><p>... and what more could someone who is starting a company aspire to?\n              </p>"
      },
      {
        "indent": 4,
        "user": "rquantz",
        "age": "on Oct 6, 2011",
        "comment": "&gt;&gt; How did he spend the last 8 years of his life? Enjoying himself? No. He drove himself and Apple to build the next generation of the personal computer.<p>Make no mistake: he loved every minute of it.\n              </p>"
      },
      {
        "indent": 5,
        "user": "mturmon",
        "age": "on Oct 6, 2011",
        "comment": "I believe it was in his commencement address that he said something to the effect of, there will be days when you look in the mirror and have to say, I don't want to work today.  But you do anyway.  But if there are enough of these days in a row, you know you need to make a change."
      },
      {
        "indent": 6,
        "user": "equalarrow",
        "age": "on Oct 6, 2011",
        "comment": "So true.<p>I've left two very well paying positions (one at a very reputable design company that designed some of the early Apple &amp; NeXT products) in the past year because I did look in the mirror and realized they were not right for me.</p><p>You have to follow your passion, back it up with action, and everything else will fall into place.\n              </p>"
      },
      {
        "indent": 7,
        "user": "palish",
        "age": "on Oct 9, 2011",
        "comment": "Careful though; this is the reason I'm currently left with $300 total."
      },
      {
        "indent": 1,
        "user": "tyroneschiff",
        "age": "on Oct 6, 2011",
        "comment": "My absolute favorite line of that entire speech is the very last, \"Stay hungry. Stay foolish.\" I live by it and will continue to do so. What an iconic brilliant genius the world has lost."
      },
      {
        "indent": 1,
        "user": "checker",
        "age": "on Oct 6, 2011",
        "comment": "He definitely loved what he did.  He stuck with it until the end.  RIP Steve."
      },
      {
        "indent": 2,
        "user": "marcalc",
        "age": "on Oct 6, 2011",
        "comment": "To the very end. That's incredible and sad. I don't know him personally, but knowing his biography, the kind of person he was and the impact he has on my daily life, man... i feel like having lost a close relative. Sad... :( May he rest in peace, for he have inspired us."
      },
      {
        "indent": 3,
        "user": "TomOfTTB",
        "age": "on Oct 6, 2011",
        "comment": "This is terribly tragic and don't take anything I say after this as meaning anything other than that.<p>But the more I think about this the more I think this is somehow the way things were meant to be.  I mean, as much as we wish it wasn't true people do get diminished by age.  The dashing young actor loses a little when you see him as a 60 year old.  Your memory of him gets altered in the smallest of ways.</p><p>Steve Jobs is now enshrined in the world's collective memory as the magic man in a black shirt and jeans.  He'll always be that now.  I'd certainly trade his legend for a few more years of his life but at the same time the world needs legendary figures.</p><p>Would it have been better if Abraham Lincoln had been around for two terms?  Yes.  But would he have inspired generations of Americans if he'd gotten mired down in the politics of reconstruction and been forced to act like \"just another politician\"?  I doubt it.</p><p>So it's horribly sad that Steve Jobs died but the fact that he was amazing to the very end is what will make him a legend going forward.\n              </p>"
      },
      {
        "indent": 4,
        "user": "hugh3",
        "age": "on Oct 6, 2011",
        "comment": "There's something to be said for retiring at the right time, but no, I don't think Steve Jobs' legacy would have been robbed of anything if he'd lived to enjoy thirty years of comfortable retirement.<p>Even dashing young actors aren't diminished by age. If Sean Connery had died young he would have robbed us of some great roles. And if Paul Newman had died young he would have robbed us of some tasty salad dressing.\n              </p>"
      },
      {
        "indent": 1,
        "user": "runn1ng",
        "age": "on Oct 6, 2011",
        "comment": "Love what you do. Do what you love.<p>The dots will connect one day. Even if others don't believe you, because you will die one day anyway.</p><p>It's inspirational and great.\n              </p>"
      },
      {
        "indent": 1,
        "user": "pullo",
        "age": "on Oct 6, 2011",
        "comment": "Steve and his team have changed the way we live. Making us all introspect on our lives work..is probably his second monumental contribution..."
      },
      {
        "indent": 1,
        "user": "treenyc",
        "age": "on Oct 6, 2011",
        "comment": "I don't normally post here.  However, this speech is one of an inspiration for me to do the 'foolish' things in life."
      },
      {
        "indent": 1,
        "user": "pcj",
        "age": "on Oct 6, 2011",
        "comment": "Visionary, par excellence!"
      },
      {
        "indent": 0,
        "user": "tc",
        "age": "on Oct 6, 2011",
        "comment": "What Apple is going to be missing without Steve Jobs isn't creative talent or even someone capable of saying 'no.'<p>It's going to be missing someone who has the absolute credibility to say it.</p><p>Anyone can be a tyrant.  If Steve Jobs was a dictator, it was because people thought he had the right to be.\n              </p>"
      },
      {
        "indent": 1,
        "user": "sjtgraham",
        "age": "on Oct 6, 2011",
        "comment": "Considering how apparent it was that Steve’s health was gravely bad and rapidly deteriorating, we all in the back of our minds knew the time we had him in this world was limited and precious. So it comes as a complete shock to me how upset I actually am by Steve’s passing.<p>Even though most of us never knew him, we all feel as if we did know him very well; his inventions, complete labours of love, have become so central to how we live our lives. The profound impact his creations have had on us cannot make us feel any other way.</p><p>I didn't go to college, and I remember having a shitty job back in the day, saving so hard to buy a PowerBook G4, but it was completely worth it because purchasing that machine literally changed my life. Without a computer that was an absolute joy to use, I would have never spent so many hours learning how to code and consequently now have the career opportunities that I do.</p><p>I feel eternally indebted to Steve, despite having never met the man myself. By creating the wonderful tools he did for us to work with, I feel he is significantly responsible for the career I have today.</p><p>To one of the few that can say ‘I changed the world’, thank you.</p><p>Rest in peace Steve\n              </p>"
      },
      {
        "indent": 2,
        "user": "alexbell",
        "age": "on Oct 6, 2011",
        "comment": "This.  While I'd done a little scripting, I was never interested in working in software development.  It made me think of boring/painful win32 programs.  After I graduated college I skipped around through sales jobs I hated and was terrible at.  And then I got an iOS device (2g iPod Touch) for my birthday, and I was suddenly very interested in programming.  The way that device was so effortless to use, powerful (for its size), and fun captivated me.  Within a year of receiving that that device I was roughly a third of the way through a CS degree (post baccalaureate), going to school part time and paying for it with my part time job (working at an Apple Store).  I've been a paid professional developer for almost two years now, primarily working on iOS stuff.  And I really like what I do.  It sounds stupid, but I really don't know what I'd be doing now if I hadn't gotten that iPod Touch.<p>Thanks Steve, I certainly feel like you've done something for me even though I've never met you.\n              </p>"
      },
      {
        "indent": 3,
        "user": "chugger",
        "age": "on Oct 9, 2011",
        "comment": "wanted to share this tribute I found to everyone.<p><a href=\"http://www.youtube.com/watch?v=Iy6BY_TzX7I\" rel=\"nofollow\">http://www.youtube.com/watch?v=Iy6BY_TzX7I</a>\n              </p>"
      },
      {
        "indent": 2,
        "user": "zvrba",
        "age": "on Oct 7, 2011",
        "comment": "\"Without a computer that was an absolute joy to use, I would have never spent so many hours learning how to code and consequently now have the career opportunities that I do.\"<p>That's what Commodore 64 did for me (I grew up with it), and that might be the reason that I'm not the least impressed by any of Apple's products. Furthermore, Apple's conduct -- patent litigations, DRM, \"simple\" user interfaces -- it all goes against the spirit of opennes and sharing in the \"old days\" when people shared their code and hacks as printouts in computer magazines.</p><p>Steve Jobs may rest in peace, he did a lot. I got enormous respect for him when I learned that he basically saved Pixar, and that's what I will remember him for.</p><p>Apple, the company, could disappear tomorrow and I wouldn't miss it the slightest.</p><p>(I know I'll get downvoted by Apple fanboys, but so be it.)\n              </p>"
      },
      {
        "indent": 2,
        "user": "j_baker",
        "age": "on Oct 6, 2011",
        "comment": "<i>we all in the back of our minds knew the time we had him in this world was limited and precious.</i><p>I can't think of a better way to put this.  I think it's fair to say that we benefitted from his life just as much if not more than he did.\n              </p>"
      },
      {
        "indent": 1,
        "user": "alexqgb",
        "age": "on Oct 6, 2011",
        "comment": "This difference, I suppose, is between someone bending your will to theirs, reducing you terribly in the process, and someone who sees you failing to deliver everything you're capable of, and pushing you (hard) to do what he thinks what you can.<p>The former doesn't care about who you are. The latter cares deeply, and expresses in by placing genuine faith in you. Everything being said by the people who worked with him indicates that they feel humbled and honored by the experience. It's hard to get upset with someone's approach when you know in your bones that it got you to the top of your game.</p><p>What people feel in response to that is love.</p><p>[EDIT]\n\"He was dubbed a megalomaniac, but Steve Jobs often gambled on young, largely inexperienced talent to take Apple forward; Jony Ive and his team prove that such faith was spot on.\"\n              </p>"
      },
      {
        "indent": 1,
        "user": "astine",
        "age": "on Oct 6, 2011",
        "comment": "One could make an entire PoliSci dissertation out of your comment."
      },
      {
        "indent": 2,
        "user": "littlegiantcap",
        "age": "on Oct 6, 2011",
        "comment": "As a poli sci major one could make a poli sci comment out of anything."
      },
      {
        "indent": 1,
        "user": "phzbOx",
        "age": "on Oct 6, 2011",
        "comment": "Here's a very well done video <a href=\"http://www.bloomberg.com/video/66625228/\" rel=\"nofollow\">http://www.bloomberg.com/video/66625228/</a>"
      },
      {
        "indent": 2,
        "user": "mercury888",
        "age": "on Oct 6, 2011",
        "comment": "No flash on my iPad :("
      },
      {
        "indent": 1,
        "user": "capkutay",
        "age": "on Oct 6, 2011",
        "comment": "What Apple is missing is a man whose vision for a product is exactly what the consumer wants....two years ahead of time (at least)."
      },
      {
        "indent": 1,
        "user": "barista",
        "age": "on Oct 6, 2011",
        "comment": "A very well earned right and credibility indeed. Very few turnaround stories in the tech industry that are of the magniture of Apple's."
      },
      {
        "indent": 2,
        "user": "runjake",
        "age": "on Oct 6, 2011",
        "comment": "I'm not sure there's a single story of the same magnitude. And that isn't sentimentality talking, I can't think of anything."
      },
      {
        "indent": 1,
        "user": "cldwalker",
        "age": "on Oct 6, 2011",
        "comment": "HN, why is this above steve's own quote about death?"
      },
      {
        "indent": 0,
        "user": "chaosmachine",
        "age": "on Oct 6, 2011",
        "comment": "If you watched the iPhone keynote yesterday, you may have noticed this:<p><a href=\"http://i.imgur.com/BsIoS.png\" rel=\"nofollow\">http://i.imgur.com/BsIoS.png</a></p><p>This shot was shown for about 5 seconds right at the beginning of the recording. Front row, center. Reserved. Empty.\n              </p>"
      },
      {
        "indent": 1,
        "user": "sethg",
        "age": "on Oct 6, 2011",
        "comment": "I have this image of Steve watching the keynote on TV from his hospital bed, and then turning to his doctor and saying, “OK, I’m done here.”"
      },
      {
        "indent": 2,
        "user": "mcantor",
        "age": "on Oct 6, 2011",
        "comment": "I think it's more likely that he would have said, \"I've barely begun.\""
      },
      {
        "indent": 1,
        "user": "robflynn",
        "age": "on Oct 6, 2011",
        "comment": "Whether this chair was for Steve or not, it felt very symbolic/struck a chord with me. I'm surprised at how sad this single photo made me feel.  We all knew it was coming, but it still hit me in a way I didn't think it would.<p>He shall be missed.</p><p>I never met you, but you were an inspiration. Rest well, Steve.\n              </p>"
      },
      {
        "indent": 1,
        "user": "dvdhsu",
        "age": "on Oct 6, 2011",
        "comment": "Bob Mansfield, and Phil Schiller are both in that row. It's likely that it was reserved for Steve."
      },
      {
        "indent": 1,
        "user": "exogen",
        "age": "on Oct 6, 2011",
        "comment": "I noticed that too. Look at the backs of the filled chairs, though –&nbsp;all reserved."
      },
      {
        "indent": 1,
        "user": "breakall",
        "age": "on Oct 6, 2011",
        "comment": "I noticed it too and assumed it was for Steve since Tim Cook came out initially."
      },
      {
        "indent": 1,
        "user": "akamaka",
        "age": "on Oct 6, 2011",
        "comment": "It just as likely was the seat of whoever was on stage at the time."
      },
      {
        "indent": 2,
        "user": "chernevik",
        "age": "on Oct 6, 2011",
        "comment": "There is nothing \"likely\" about the compositions of a person fluent in storytelling through images.  Such people don't spend their initial image, or its point of focus, cheaply.<p>Steve insisted on subordinating technology to human purposes and narratives.  It might be his most important lesson.\n              </p>"
      },
      {
        "indent": 0,
        "user": "dustingetz",
        "age": "on Oct 5, 2011",
        "comment": "<i>Jobs imagines his garbage regularly not being emptied in his office, and when he asks the janitor why, he gets an excuse: The locks have been changed, and the janitor doesn’t have a key. This is an acceptable excuse coming from someone who empties trash bins for a living. The janitor gets to explain why something went wrong. Senior people do not. “When you’re the janitor,” Jobs has repeatedly told incoming VPs, “reasons matter.” He continues: “Somewhere between the janitor and the CEO, reasons stop mattering.” That “Rubicon,” he has said, “is crossed when you become a VP.</i><p>-- Jobs (via secondary source [1])</p><p>[1] <a href=\"http://www.macstories.net/news/inside-apple-reveals-steve-jobs-anecdotes-apples-little-known-facts/\" rel=\"nofollow\">http://www.macstories.net/news/inside-apple-reveals-steve-jo...</a>\n              </p>"
      },
      {
        "indent": 0,
        "user": "kristofferR",
        "age": "on Oct 6, 2011",
        "comment": "\"No one wants to die. Even people who want to go to heaven don't want to die to get there. And yet death is the destination we all share. No one has ever escaped it. And that is as it should be, because Death is very likely the single best invention of Life. It is Life's change agent. It clears out the old to make way for the new. Right now the new is you, but someday not too long from now, you will gradually become the old and be cleared away. Sorry to be so dramatic, but it is quite true.<p>Your time is limited, so don't waste it living someone else's life. Don't be trapped by dogma — which is living with the results of other people's thinking. Don't let the noise of others' opinions drown out your own inner voice. And most important, have the courage to follow your heart and intuition. They somehow already know what you truly want to become. Everything else is secondary.\"</p><p>- Steve Jobs\n              </p>"
      },
      {
        "indent": 1,
        "user": "jquery",
        "age": "on Oct 6, 2011",
        "comment": "<i>\"Death is very likely the single best invention of Life.\"</i><p>Quotes like this get me thinking back to my fascination reading about Cognitive Dissonance in Psych 101.\n              </p>"
      },
      {
        "indent": 2,
        "user": "Helianthus",
        "age": "on Oct 6, 2011",
        "comment": "What do you mean?"
      },
      {
        "indent": 3,
        "user": "orangecat",
        "age": "on Oct 6, 2011",
        "comment": "Death is not good; it is very bad. If given the opportunity to live \"forever\" (and not age), you'd take it. In a world without death, nobody would think introducing it was a good idea. But because we currently can't do anything about it, we try to tell ourselves it's a good thing."
      },
      {
        "indent": 4,
        "user": "wtallis",
        "age": "on Oct 6, 2011",
        "comment": "That's only cognitive dissonance if you're hopelessly egocentric. Death is obviously bad for you as an individual, but is crucial to the long-term survival on a species. Without death, you can't have evolution or adaptability. The only thing wrong here are the people responding with the fallacy of composition."
      },
      {
        "indent": 5,
        "user": "icandoitbetter",
        "age": "on Oct 6, 2011",
        "comment": "I cannot even begin to conceive the kind of confusion that has legitimized the \"species over the individual\" narrative. Just because something is natural doesn't mean that it's good. If you consider it \"hopelessly egocentric\" to think of death as a bad, bad thing since it's necessary for natural selection, do you also consider it ethically acceptable to kill an individual once he has stopped procreating, since he's no longer relevant to the evolutionary game?"
      },
      {
        "indent": 6,
        "user": "elemenohpee",
        "age": "on Oct 6, 2011",
        "comment": "The species over the individual \"narrative\" exists because it is a fact of evolution.  Life is a pattern of self-replication, and it is at the level of the gene that natural selection works to make this pattern more robust.  The whole concept of having an individual \"over\" a species is so quaintly human. The universe, and the physical processes within it that are life, have no concern for such silly concepts.  To put so much stock into the individual (and such people are always really talking about themselves), is completely egocentric.  We tell ourselves stories about how important and special we are to validate our own existences, and that's fine, it makes some of us feel better.  But we ignore the macro-processes that even allowed our existences at our own peril.  Guess what, with no species, there are no individuals to glorify.<p>&gt;do you also consider it ethically acceptable to kill an individual once he has stopped procreating, since he's no longer relevant to the evolutionary game?</p><p>The evolutionary game is much more complicated than you imagine it to be.  Humans have evolved to be social animals.  Someone who is too old to procreate can still watch after young, pass knowledge on to them, etc., which increases their fitness.  This is such a fundamental misunderstanding, you have no reason to be so confident in such matters.\n              </p>"
      },
      {
        "indent": 7,
        "user": "Udo",
        "age": "on Oct 6, 2011",
        "comment": "Evolution is a vehicle for genes, bodies are just incidental to this process. We are, however, more than bodies that breed genes. We are persons, we have minds. We have developed into something that goes beyond the substrate from which we came and we owe it to ourselves to some day outgrow the need for that substrate completely.<p>Imagine what our minds could do if they had centuries to develop. Imagine what our culture could be like if we didn't have to start from scratch every 70 years. Imagine a society without loss and scarcity. I know it's not an idea that appeals to a lot of people, but it does appeal to me. And I do believe it's an inevitable next step. In the end, it doesn't matter what most people think of this idea. It's not a development that the majority of humanity has to sign off on - we'll just move along without you, no harm done.\n              </p>"
      },
      {
        "indent": 8,
        "user": "elemenohpee",
        "age": "on Oct 6, 2011",
        "comment": "&gt; We are, however, more than bodies that breed genes. We have developed into something that goes beyond the substrate from which we came and we owe it to ourselves to some day outgrow the need for that substrate completely.<p>I'm not sure I accept that, and I have yet to see an argument that demonstrates this convincingly.  What substrate are you talking about?  The physical world?  We are a part of and a result of the physical world, not separate from it.  The notion of moving beyond it is nonsensical.  If you're talking about the biological substrate, then I agree, we may see technology evolve beyond us.  But this is still the self-replication pattern that is being propagated, not humanity itself.</p><p>&gt;Imagine what our culture could be like if we didn't have to start from scratch every 70 years.</p><p>We don't start from scratch, that is the greatest advantage of our minds which have created written and oral communication.  It has been demonstrated that people grow more conservative as they get older and set in their ways.  New ideas are the purview of the young.  I can very well imagine our culture stagnating if individuals were able to live indefinitely.</p><p>&gt;Imagine what our minds could do if they had centuries to develop.</p><p>If we're still talking about organic brains, I don't think we <i>can</i> imagine that.  Our brains were not designed to receive more than 100 or so years of input.  The yips in golfers arise from mental maps of the body \"bleeding over\" after too much training.  The wiring of the brain may not be designed to handle so much input.  I can easily see an analagous process happening in more purely cognitive situations.  In short, we don't know what would happen, and it would be presumptuous to think that we do.</p><p>&gt; Imagine a society without loss and scarcity.</p><p>What do you mean that doesn't appeal to people?  It's a utopian fantasy, of course it sounds good. But to say that it's inevitable is wishful thinking.  Ironically, it may be our individualistic culture that does what is good for the self, with no concern for the future good that prevents such a development.  Our plunder of the world's resources and our destruction of the environment may very well leave the planet unsuitable for human life.  This is the idea that I was addressing in my first post, that of course the species does and should take precedent over the individual.\n              </p>"
      },
      {
        "indent": 9,
        "user": "jodrellblank",
        "age": "on Oct 6, 2011",
        "comment": "<i>I can very well imagine our culture stagnating if individuals were able to live indefinitely</i><p>That's shown me. I guess the death of myself, my loved ones, my friends, and all 7 billion humans alive today isn't so bad compared to the sheer horror of <i>culture staying the same</i>.</p><p>Where's your perspective?</p><p><i>In short, we don't know what would happen, and it would be presumptuous to think that we do.</i></p><p>But it would be ridiculous to reject the idea of it based on speculation that it might not be possible.</p><p><i>Our plunder of the world's resources and our destruction of the environment</i></p><p>Rubbish, rubbish, rubbish. This self-flagellating viewpoint isn't winning points from a kindly jury. We can't \"destroy\" the environment or \"plunder\" the world's resource. All the stuff we've dug up is still in the universe, there is still <i>an environment</i>, and largely it's still the same as it ever was.</p><p>There was vastly more severe environmental change happening outside the time of humans than there has been during it, and we don't talk about the time the crust cooled and set as \"the great environmental destruction\", do we? Or when oxygen levels dropped, or when the earth warmed and ice ages finished? Or when plants appeared and took over the earth?</p><p>They were all enormous changes, yet today it's \"greenhouse gases and global warming, oh we're so sorry, we're really horrible, we deserve a punishment\".</p><p><i>may very well leave the planet unsuitable for human life.</i></p><p>Then we should probably fix that, not prostrate ourselves and play who's the most cynical and holier-than-thou games.</p><p><i>This is the idea that I was addressing in my first post, that of course the species does and should take precedent over the individual.</i></p><p>Of course it does? I refute that. We, the living humans on this planet, take precedence over all future, potential, hypothetical humans by virtue of <i>our existence</i> and their <i>non-existance</i>. Of course we do, any other view is ridiculous. Can you imagine \"women and children first\" changing to \"imaginary hypothetical people first, women and children second\"? No.\n              </p>"
      },
      {
        "indent": 10,
        "user": "elemenohpee",
        "age": "on Oct 6, 2011",
        "comment": "&gt; That's shown me. I guess the death of myself, my loved ones, my friends, and all 7 billion humans alive today isn't so bad compared to the sheer horror of culture staying the same.<p>Unless you think we're perfectly adapted to all future circumstances, different selective pressures will require change, as they have for the past 4 billion or so years on this planet.  Plus, good luck getting people to stop fucking.  We have a finite amount of resources available.  Regardless of the philosophical implications, it's not even practical to try to keep people alive forever.  You ask where my perspective is, yet you brush concerns like this under the rug because you can't bear the thought of you personally having to go through the experience of losing loved ones, as organisms have been doing for eons.</p><p>&gt; But it would be ridiculous to reject the idea of it based on speculation that it might not be possible.</p><p>Yes, I overreached there.  I meant only to reject the idea that it will necessarily lead to positive outcomes.</p><p>&gt; All the stuff we've dug up is still in the universe, there is still an environment, and largely it's still the same as it ever was.</p><p>And a lot of it we've put through physical and chemical changes which are non-reversible.  And <i>an</i> environment is different than one that can sustain us comfortably.  I didn't think I was going to have to defend simple facts about resource consumption.</p><p>&gt; There was vastly more severe environmental change happening outside the time of humans than there has been during it, and we don't talk about the time the crust cooled and set as \"the great environmental destruction\", do we? Or when oxygen levels dropped, or when the earth warmed and ice ages finished?</p><p>We probably would if we were around for it.  Species were wiped out.  As the environment changes now, selective pressures will change again, and anything maladapted to them will die out.  If indeed we are changing the environment and extracting resources at an unsustainable rate, we may die out or be radically changed, and by definition, something more able to keep their consumption under control will flourish.  I believe that we have reached an evolutionary point where a much quicker memetic evolution will allow humans to adapt, but the resistance to this collective way of thinking will need to be overcome.</p><p>&gt; Then we should probably fix that, not prostrate ourselves and play who's the most cynical and holier-than-thou games.</p><p>What game do you think I am playing here?  I'm making an earnest argument that maybe the life cost of trying to build the biggest SUVs is too high, and will disadvantage our species in the long run.</p><p>&gt; We, the living humans on this planet, take precedence over all future, potential, hypothetical humans by virtue of our existence and their non-existance.</p><p>And by definition, this is egocentric, which was the original point.  Unless you deny that people will be born in the future, calling them imaginary is intellectually dishonest.  Pretending that they will never exist achieves nothing except to deflect your anxiety about taking actions which will make the lives of your descendents more difficult.\n              </p>"
      },
      {
        "indent": 5,
        "user": "jodrellblank",
        "age": "on Oct 6, 2011",
        "comment": "I don't care about some dreamy ideal of evolution or adaptability so much that I would choose to die for it.<p>[Edit for more substance: you imply evolution is driving humanity towards some 'good' destination, such that more evolution is better. This isn't how evolution works.]\n              </p>"
      },
      {
        "indent": 6,
        "user": "wtallis",
        "age": "on Oct 6, 2011",
        "comment": "\"you imply evolution is driving humanity towards some 'good' destination\"<p>No. All I'm implying is that humanity, in its current form, cannot survive all possible natural threats to its existence. We're still competing with other species, and we're still vulnerable to things like the effects of climate change, so if we completely stop evolving, it's likely that in only a few thousand years, we'll be completely dependent on our technology for survival.\n              </p>"
      },
      {
        "indent": 7,
        "user": "Jach",
        "age": "on Oct 6, 2011",
        "comment": "I'm trying to understand what your view of evolution is if you think we're going to be significantly different in a few thousand years given we stopped all technological process today and let \"nature take its course\", or if you think we can survive things like climate change without using our intelligence and technology (perhaps it will even be necessary to augment both). Evolution is slow, evolution is dumb, evolution isn't going to magically make us more likely to survive threats to our existence. You would rather subject yourself to such a blind, dumb, uncaring process, than a future product, perhaps itself intelligent, of our own intelligence that outclasses a natural evolutionary process in every way? Do you think evolution is going to magically get our species off this planet should an asteroid wander this way, or in the future when the Sun dies? Our long-term survival is completely dependent on our technology already.<p>I would be very surprised and disappointed if our technological processes in a mere <i>hundred</i> years are not more robust and better than evolutionary equivalents--indeed we can already do many things evolution could never do itself, the last big step is doing that more on the micro scale. Work on that has already begun, it's pretty exciting to look at it. E. glowli is just the very beginning.\n              </p>"
      },
      {
        "indent": 7,
        "user": "jodrellblank",
        "age": "on Oct 6, 2011",
        "comment": "You're still doing it. When you say <i>\"We're still competing with other species, and we're still vulnerable to things like the effects of climate change, so if we completely stop evolving\"</i>, what you imply is that if we keep evolving, we will improve until we can survive climate change and outcompete other species.<p>Again, that's not how it works - dinosaurs didn't evolve to be meteor resistant, and carrying on evolving could as well lead to our extinction as to our saving, or indeed to our losing intelligence and becoming a niche species again.</p><p>And that's aside from the fact that even with technological immortality, we'd still have people dieing and being created, and evolution will still be happening - it <i>can't</i> not-happen.\n              </p>"
      },
      {
        "indent": 5,
        "user": "orangecat",
        "age": "on Oct 6, 2011",
        "comment": "<i>Death is obviously bad for you as an individual, but is crucial to the long-term survival on a species. Without death, you can't have evolution or adaptability.</i><p>Once a species has the intelligence and technology to eliminate death, they'll be able to evolve and adapt themselves far more effectively than evolution via natural selection.\n              </p>"
      },
      {
        "indent": 5,
        "user": "zasz",
        "age": "on Oct 6, 2011",
        "comment": "Uh...if every member of a species happened to be immortal, that species would be the most successful species ever. Natural selection is all about getting rid of individuals who can't hack it. An individual who can't die is clearly one that can hack it, and is perfectly adapted to all situations."
      },
      {
        "indent": 5,
        "user": "mannicken",
        "age": "on Oct 8, 2011",
        "comment": "Obviously. From what I know, ego is created by memories from a subjective experience. Death is nothing but destruction of memories. Some of the memories and experiences are selected and stored in global consciousness (like art/writing/design/etc). Same thing as death would probably happen if all your memory were to suddenly become unavailable within a context of staying awake as a physical body. We're all in linked system (your memories come from others, your ego is build from global consciousness + the context of your physical body) so \"death\" as in the end of phenomen of consciousness is possible but hardly achievable. Even if we kill every living being on earth, who's to say consciousness won't recreate again or it hasn't already. I'll come back to this at the end.<p>What's funny is memories are also re-created and retouched when we recall them. The whole thing is very complex and when people say they 'know for sure' something about life/death it irritates the hell out of me.</p><p>Individual death isn't bad or good. Death just is. It's more fluid and complex than bad or good. Not to mention \"dead/alive\" itself are fluid concepts. People choose to interpret death as good or bad because people are idiots.</p><p>If death was ultimately bad people wouldn't commit suicide all the time. If death was ultimately good people wouldn't apply so much effort to keep alive. People choose to think suicidals are by definition mentally ill also because people are idiots. If you're in a burning building, you most likely will jump out of the building committing suicide because the alternative (being burned alive) is much worse. Similar thing with a lot of suicides.</p><p>My point is: people are naive idiots and we still have no idea what exactly happens after death, and what exactly is 'after' or before. The idiocy of people when it comes to the subject of death figuratively speaking makes me want to kill myself.</p><p>The comforting thing is, within a context of individual consciousness you're pretty much fucking immortal. Whatever happens outside of the context of functioning consciousness should really be none of your concern. It is impossible to \"feel dead\". \"When I'm alive death isn't here, when I'm dead I won't be there to witness it\".\n              </p>"
      },
      {
        "indent": 5,
        "user": "sdrinf",
        "age": "on Oct 6, 2011",
        "comment": "This madness has to stop."
      },
      {
        "indent": 4,
        "user": "hugh3",
        "age": "on Oct 6, 2011",
        "comment": "Yeah, but without death the whole world would be filled to the brim with protobacteria, and none of us complex life forms would ever have had room to exist."
      },
      {
        "indent": 5,
        "user": "danssig",
        "age": "on Oct 6, 2011",
        "comment": "I'm pretty sure he's talking about death <i>of people</i>.  I'm sure he gets the same satisfied smile smashing a mosquito that the rest of us do."
      },
      {
        "indent": 4,
        "user": "paganel",
        "age": "on Oct 6, 2011",
        "comment": "&gt; Death is not good; it is very bad. If given the opportunity to live \"forever\" (and not age), you'd take it. In a world without death, nobody would think introducing it was a good idea. But because we currently can't do anything about it, we try to tell ourselves it's a good thing.<p>That doesn't explain self-sacrifice. And, honestly, I wouldn't want to live an \"eternal\" life when everybody I love and know around me would be dead at some point or another. Maybe this is also why I've come to see Christianity's  \"promise\" of eternal life as ridiculous and almost scary at times.</p><p>As Seneca used to say, it doesn't matter how long you live, it's what you do with your life that matters (<a href=\"http://en.wikipedia.org/wiki/De_Brevitate_Vitae_%28Seneca%29\" rel=\"nofollow\">http://en.wikipedia.org/wiki/De_Brevitate_Vitae_%28Seneca%29</a>)</p><p>\"\"\"\nThe philosopher brings up many Stoic principles on the nature of time, namely that men waste much of it in meaningless pursuits. According to the essay, nature gives man enough time to do what is really important and the individual must allot it properly. \n\"\"\"</p><p>And to finish in an even more pathetic tone, I don't think we should strive for living an eternal life, but rather do what Julius Caesar did when he realized that Alexander had already conquered the world by 30: weep, and then try to conquer the world by ourselves.\n              </p>"
      },
      {
        "indent": 4,
        "user": "equalarrow",
        "age": "on Oct 6, 2011",
        "comment": "Exactly. Longevity and maintenance are the key.<p>The reason to want to live longer? One word: space.</p><p>Living hundreds of years in good health will allow us all to become a space faring race. It will allow us to take the long view on interstellar travel, our species and relationships. I'm hoping to see that day and having Steve leave so early only solidifies the importance of longevity in my mind. Intelligence is not meant to die, it's meant to live. We accept death only because we have to and have been powerless to stop it. Technology is starting to change all that.\n              </p>"
      },
      {
        "indent": 1,
        "user": "kahawe",
        "age": "on Oct 6, 2011",
        "comment": "As amazing and wise and wonderful as this quote is... I doubt many people actually get the chance in life to do this. I know I am on the wrong website with this but once you look just a bit outside of silicon valley and a bit outside of the (comparatively very) rich western world, you start to realize: there are just very very few people who were or are ever as blessed as to not only be able to follow their heart but become so influential and important by doing so.<p>This makes me just more sad. Or maybe I am just at a bad place in life.\n              </p>"
      },
      {
        "indent": 2,
        "user": "Hisoka",
        "age": "on Oct 6, 2011",
        "comment": "I agree. We all like to say \"Life is short, we have to live it to the fullest\" but do our actions really reflect that? Some of us have the ability to do more, yet are complacent and happy with the status quo. Others are not in any situation to do more. Just call bullshit on anyone that says this until he/she really walks the walk."
      },
      {
        "indent": 0,
        "user": "cek",
        "age": "on Oct 5, 2011",
        "comment": "When I was 10 I visited my uncle’s factory in Michigan. He sat me down in front of an Apple II and fired up a video game. As I played Castle, I noticed the manual for the Applesoft programming language sitting next to the computer. I cracked it open and realized I could break into the monitor and see the source code.<p>I did just that, modifying the game to the point it was no longer playable. I had saved the file and effectively broke it. I shut off the computer, and never told my uncle.</p><p>The excitement of that moment stuck with me and was the enabler of the amazing life I've had since.</p><p>Thank you Steve Jobs. RIP.\n              </p>"
      },
      {
        "indent": 1,
        "user": "afterburner",
        "age": "on Oct 6, 2011",
        "comment": "My first computer was an Apple IIc, on which I taught myself BASIC (which provided many memorable minor revelations). Thanks for your efforts Steve Jobs."
      },
      {
        "indent": 1,
        "user": "joezydeco",
        "age": "on Oct 6, 2011",
        "comment": "I was introduced to an Apple ][ at about exactly the same time as you.  It changed my life forever as well."
      },
      {
        "indent": 0,
        "user": "JunkDNA",
        "age": "on Oct 6, 2011",
        "comment": "I had a feeling this was right around the corner the moment I saw his presentation to the Cupertino planning committee. My dad died of pancreatic cancer 10 years ago at the age of 46. In the month or so leading up to the end, as his liver started to fail, his voice changed and at times seemed almost \"thick\". When I heard Steve start to speak, it immediately made me think of my dad.<p>My heart goes out to his family and friends. Steve was a childhood hero of mine as far back as I can remember. The world was a much better place with him in it.\n              </p>"
      },
      {
        "indent": 0,
        "user": "mixmax",
        "age": "on Oct 6, 2011",
        "comment": "<i>Here’s to the crazy ones. The misfits. The rebels. The troublemakers. The round pegs in the square holes. The ones who see things differently. They’re not fond of rules. And they have no respect for the status quo. You can quote them, disagree with them, glorify or vilify them. About the only thing you can’t do is ignore them. Because they change things. They push the human race forward. And while some may see them as the crazy ones, we see genius. Because the people who are crazy enough to think they can change the world, are the ones who do.</i>"
      },
      {
        "indent": 1,
        "user": "jmatt",
        "age": "on Oct 6, 2011",
        "comment": "This is from the Think Different campaign (1997+): <a href=\"http://en.wikipedia.org/wiki/Think_Different\" rel=\"nofollow\">http://en.wikipedia.org/wiki/Think_Different</a><p>I really shouldn't admit this but /cough circa 1997 I had abandoned Apple. I had a PC and Linux box at home and Unix terminal at school. I remember being impressed by this campaign and hopeful that Jobs would fix Apple. But I couldn't have imagined what Apple and Steve Jobs had in store for the world. What a remarkable recovery. Thanks Steve.\n              </p>"
      },
      {
        "indent": 0,
        "user": "ilamont",
        "age": "on Oct 6, 2011",
        "comment": "\"Being the richest man in the cemetery doesn't matter to me ... Going to bed at night, saying we've done something wonderful... that's what matters to me.\"<p>- Inscription on Steve Jobs' star at the Entrepreneur Walk of Fame in Cambridge, Mass., unveiled on 9/16/2011: <a href=\"http://instagr.am/p/NPa4o/\" rel=\"nofollow\">http://instagr.am/p/NPa4o/</a>\n              </p>"
      },
      {
        "indent": 1,
        "user": "gnosis",
        "age": "on Oct 6, 2011",
        "comment": "Would have been much more impressive if he'd proven that being rich <i>while alive</i> didn't matter to him.<p>Honestly, how many people care about how much is in their bank account <i>after they die</i>?  Probably not very many.</p><p>Plenty chase riches while they're alive, however.  And good old Steve was no exception.\n              </p>"
      },
      {
        "indent": 2,
        "user": "mantas",
        "age": "on Oct 6, 2011",
        "comment": "If you run out of ideas, you start to help the world in the easiest way - by giving away your money.<p>Jobs hadn't run out of ideas though.\n              </p>"
      },
      {
        "indent": 3,
        "user": "Steko",
        "age": "on Oct 6, 2011",
        "comment": "Well put.<p>I'll add that what's even better then giving away your money is not taking too much in the first place.</p><p>Steve Jobs was a multi-billionaire but, as Apple's stock laps the field, it bears noting that Steve's billions are a fraction of what others in similar positions are worth.\n              </p>"
      },
      {
        "indent": 4,
        "user": "2muchcoffeeman",
        "age": "on Oct 6, 2011",
        "comment": "<a href=\"http://www.forbes.com/wealth/billionaires/list?page=2\" rel=\"nofollow\">http://www.forbes.com/wealth/billionaires/list?page=2</a><p>Steve Jobs is 110. It's really quite reasonable if you put it into context.\n              </p>"
      },
      {
        "indent": 3,
        "user": "JonoW",
        "age": "on Oct 6, 2011",
        "comment": "Wait a minute, are you really putting a negative spin on someone giving away their billions to charity?"
      },
      {
        "indent": 4,
        "user": "sid0",
        "age": "on Oct 6, 2011",
        "comment": "They're Apple fanboys, what do you expect. Next they'll start quoting Ayn Rand.<p>Thankfully Steve himself had far superior cognitive capacity.\n              </p>"
      },
      {
        "indent": 3,
        "user": "stumm",
        "age": "on Oct 6, 2011",
        "comment": "Is that supposed to be a jab at Bill Gates?"
      },
      {
        "indent": 4,
        "user": "LaGrange",
        "age": "on Oct 6, 2011",
        "comment": "Not necessarily. Bill Gates didn't just start giving money away, he started spending it in a fairly controlled manner, trying to accomplish well defined goals.<p>Maybe Bill Gates ran out of ideas how to help using computers, though.\n              </p>"
      },
      {
        "indent": 3,
        "user": "saraid216",
        "age": "on Oct 6, 2011",
        "comment": "Doing both: apparently hard."
      },
      {
        "indent": 2,
        "user": "firefoxman1",
        "age": "on Oct 6, 2011",
        "comment": "Steve was rewarded proportionately for his contribution to the world. He (and Apple) changed millions of lives, and indirectly influenced the rest of our lives. A byproduct of his actions were his net worth."
      },
      {
        "indent": 3,
        "user": "gnosis",
        "age": "on Oct 6, 2011",
        "comment": "<i>\"Steve was rewarded proportionately for his contribution to the world.\"</i><p>Don't even get me started.\n              </p>"
      },
      {
        "indent": 4,
        "user": "Zakuzaa",
        "age": "on Oct 6, 2011",
        "comment": "Dude, not now."
      },
      {
        "indent": 4,
        "user": "jpulgarin",
        "age": "on Oct 6, 2011",
        "comment": "Gnosis as in Samael Aun Weor?"
      },
      {
        "indent": 4,
        "user": "thomasdavis",
        "age": "on Oct 6, 2011",
        "comment": "whoa a free spirit, how can I contact you?"
      },
      {
        "indent": 4,
        "user": "jpulgarin",
        "age": "on Oct 6, 2011",
        "comment": "Gnosis as in Samael Aun Weor?"
      },
      {
        "indent": 2,
        "user": "danssig",
        "age": "on Oct 6, 2011",
        "comment": "Really?  Do you know what his salary was at Apple as CEO?  Do you know how much money the man just through away by letting stock options expire?  It seems to me that once he had a certain amount he really didn't care about money at all anymore."
      },
      {
        "indent": 0,
        "user": "gfodor",
        "age": "on Oct 6, 2011",
        "comment": "Silicon Valley is about to go into mourning. I am having a hard time getting back to work. We've been getting more rain in the south bay the last 3 days than we have all summer, it feels oddly right now.<p>I think Paul Graham's post earlier today had something for us to remember as we work through this great, deep loss:</p><p>\"I flew into the Bay Area a few days ago. I notice this every time I fly over the Valley: somehow you can sense something is going on. Obviously you can sense prosperity in how well kept a place looks. But there are different kinds of prosperity. Silicon Valley doesn't look like Boston, or New York, or LA, or DC. I tried asking myself what word I'd use to describe the feeling the Valley radiated, and the word that came to mind was optimism.\"</p><p>Here's to Steve, and his relentless optimism. Here's to the next big idea and the next person who changes the world like he did.\n              </p>"
      },
      {
        "indent": 0,
        "user": "donw",
        "age": "on Oct 6, 2011",
        "comment": "I didn't think I'd be this emotional about Jobs, but as I sit here in my apartment in Tokyo, surrounded by Apple products, I'm reminded at the impact he's had on my life.<p>On our lives. How many people on HN own iPhones and MacBooks?</p><p>There's no more fitting tribute to the man than to throw some Beatles up on iTunes and create something wonderful.</p><p>Gentlemen, let's make a dent in the universe.\n              </p>"
      },
      {
        "indent": 1,
        "user": "dholowiski",
        "age": "on Oct 6, 2011",
        "comment": "Fuck,yeah!"
      },
      {
        "indent": 0,
        "user": "100k",
        "age": "on Oct 6, 2011",
        "comment": "My dad also died of pancreatic cancer that spread to his liver (he was 55). Tough disease. Steve died before his time, but in many ways he beat the odds. Five year survivorship rate for pancreatic cancer is around 5%.<p>His vision will be missed. He left an indelible mark on a generation of technology users, and then did it again.\n              </p>"
      },
      {
        "indent": 0,
        "user": "pixelcloud",
        "age": "on Oct 6, 2011",
        "comment": "Just remember this.<p>\"You know, I've got a plan that could rescue Apple. I can't say any more than that it's the perfect product and the perfect strategy for Apple. But nobody there will listen to me.\"\n-- Steve Jobs, Sept. 18, 1995</p><p>\"If I were running Apple, I would milk the Macintosh for all it's worth -- and get busy on the next great thing. The PC wars are over. Done. Microsoft won a long time ago.\"\n-- Steve Jobs, Feb. 19, 1996</p><p>The best ideas are the ones you have to force on people.\n              </p>"
      },
      {
        "indent": 1,
        "user": "rgovostes",
        "age": "on Oct 6, 2011",
        "comment": "Last year I had the great fortune of being able to ask Steve to clarify the first quote. He was very apologetic, but alas he couldn't recall what product he envisioned in 1995."
      },
      {
        "indent": 0,
        "user": "marcamillion",
        "age": "on Oct 6, 2011",
        "comment": "Walter Isascson had better be prepared for the amount of books he is about to sell - <a href=\"http://www.amazon.com/Steve-Jobs-Walter-Isaacson/dp/1451648537/ref=sr_1_1?ie=UTF8&amp;qid=1317859076&amp;sr=8-1\" rel=\"nofollow\">http://www.amazon.com/Steve-Jobs-Walter-Isaacson/dp/14516485...</a><p>A more 'perfect' PR stunt, the official autobiographer of Steve Jobs couldn't ask for...before you start downvoting me for a seemingly insensitive comment, I don't mean that is perfect that he died. Absolutely not.</p><p>I am dealing with the loss just like any other tech-loving fan-boi.</p><p>Just pointing out that it the PR storm generated around this book as a result of his passing, will be nothing like he could have ever paid for....i.e. it is 'perfect' (from a selling the books perspective).</p><p>Perfectly sad...otherwise.\n              </p>"
      },
      {
        "indent": 1,
        "user": "chaostheory",
        "age": "on Oct 6, 2011",
        "comment": "I think Steve Jobs was prepared for it. I remember reading that the book was originally due out in Spring of 2012. He changed the deadline 5-6 months earlier for Fall of 2011."
      },
      {
        "indent": 2,
        "user": "marcamillion",
        "age": "on Oct 6, 2011",
        "comment": "I know...I do remember that the release date was pushed up too...which makes me think it might have been his 'last stroke of genius'.<p>Talk about consistently having the right timing in almost everything he does.\n              </p>"
      },
      {
        "indent": 2,
        "user": "rkudeshi",
        "age": "on Oct 6, 2011",
        "comment": "I believe Walter Isaacson/his publisher moved up the date because the manuscript was simply done early, not at Steve's request.<p>Also, it was most likely moved up to sell more during the holiday quarter.</p><p>From what little information has been released about the book, Steve was just about as hands-off as you can be (no request to read it before publishing, no demands about off-limits topics, etc.).</p><p><i>The author also responded to speculation that the publication date had been moved up because of a rumored decline in Jobs' health. \"It's actually not related to any decline,\" he said. \"I turned most of the book in this past June. It's now all done and edited. The March 2012 date (or whatever date it was) was never a deeply-considered pubdate. Like the original cover design, it came about because the publisher wanted to put something in the database last spring.\"</i></p><p><a href=\"http://www.appleinsider.com/articles/11/08/15/biography_of_apple_ceo_steve_jobs_to_arrive_in_november.html\" rel=\"nofollow\">http://www.appleinsider.com/articles/11/08/15/biography_of_a...</a>\n              </p>"
      },
      {
        "indent": 1,
        "user": "ciniglio",
        "age": "on Oct 6, 2011",
        "comment": "It's a bit insensitive to use your referral code for that amazon link if you ask me. Here's a non-affiliate link for everyone interested:<p><a href=\"http://www.amazon.com/Steve-Jobs-Walter-Isaacson/dp/1451648537\" rel=\"nofollow\">http://www.amazon.com/Steve-Jobs-Walter-Isaacson/dp/14516485...</a>\n              </p>"
      },
      {
        "indent": 2,
        "user": "marcamillion",
        "age": "on Oct 6, 2011",
        "comment": "Err....I don't even have an affiliate account.<p>That link was NOT an affiliate link.</p><p>How about checking before slandering?\n              </p>"
      },
      {
        "indent": 3,
        "user": "ciniglio",
        "age": "on Oct 6, 2011",
        "comment": "You're right, Im sorry. I thought that refs in the query string were used for affiliate links.<p>Two questions - what DO affiliate links look like, or how can I tell? Also, can I delete that comment or edit it?\n              </p>"
      },
      {
        "indent": 4,
        "user": "alanfalcon",
        "age": "on Oct 6, 2011",
        "comment": "You have a window to edit or delete the comment before it is locked in. To be fair, I also thought the \"ref\" portion of the URL might be an affiliate link, but decided to assume the best case scenario.<p>Not that we need proof that this book is going to sell like crazy, but the current Amazon rankings for it are:</p><p></p><pre><code>  Amazon Best Sellers Rank: #2 in Books\n  #1 in Books &gt; Business &amp; Investing &gt; Industries &amp; Professions &gt; High-Tech\n  #1 in Books &gt; Business &amp; Investing &gt; Biography &amp; History\n  #1 in Books &gt; Computers &amp; Internet &gt; Business &amp; Culture &gt; Biographies</code></pre>"
      },
      {
        "indent": 5,
        "user": "marcamillion",
        "age": "on Oct 6, 2011",
        "comment": "What's more interesting than that is the rise:<p><a href=\"http://i.imgur.com/agfbF.png\" rel=\"nofollow\">http://i.imgur.com/agfbF.png</a></p><p>21,300% in the last 24 hours. As predicted :)\n              </p>"
      },
      {
        "indent": 2,
        "user": "ceejayoz",
        "age": "on Oct 6, 2011",
        "comment": "There's no referral code in the link. The `ref` parameter in Amazon URLs is something internal. Amazon referral IDs get passed in the `tag` parameter."
      },
      {
        "indent": 0,
        "user": "cedsav",
        "age": "on Oct 5, 2011",
        "comment": "Cancer sucks.<p>If you care to learn more about the disease and the search for a cure, check out \"The Emperor of All Maladies: A Biography of Cancer\" by Siddhartha Mukherjee. Fascinating, scary and sobering.</p><p><a href=\"http://www.amazon.com/gp/product/B004Q66B5C\" rel=\"nofollow\">http://www.amazon.com/gp/product/B004Q66B5C</a>\n              </p>"
      },
      {
        "indent": 1,
        "user": "akmiller",
        "age": "on Oct 6, 2011",
        "comment": "Thank you very much for posting the link to this book. I had never heard of it before and after seeing your comment I immediately read some reviews, started reading the sample chapter, bought the book, and am now 3 chapters in. An amazing read, and as you state also very sobering."
      },
      {
        "indent": 1,
        "user": "rorrr",
        "age": "on Oct 6, 2011",
        "comment": "And even having billions of dollars and access to <i>any</i> medicine and <i>any</i> doctor can't save you. Fuck cancer."
      },
      {
        "indent": 2,
        "user": "cookiecaper",
        "age": "on Oct 6, 2011",
        "comment": "I've become convinced that cancer is among the elite series of diseases that are, in many cases, just <i>how people die</i>, meaning that perhaps in many instances the medical term for \"dying\" is \"cancer\". I think it is naive to ever think we'll have a general cure, especially since \"cancer\" covers such a broad range of specific issues.<p>I understand that people die in other ways too, of course, but I think cancer is a common agent that is just <i>how dying works</i>. It's like getting gray hairs -- you can do things to try and stop or cover it up (and some people will get old without much graying), people can fantasize about a fountain of youth that will keep your body at age 21 forever, but the reality is that graying is just part of aging and nothing is going to change that despite any realistic effort that humans can put in. Cancer is part of dying for many, many people. It's not going to go away despite our best efforts to mitigate its effects or eradicate it entirely.</p><p>I once read the supposed confession of a medical research assistant that \"cancer\" as a general thing is not curable but they keep the myth alive because \"cure cancer\" makes a really decent slogan.\n              </p>"
      },
      {
        "indent": 3,
        "user": "Udo",
        "age": "on Oct 6, 2011",
        "comment": "<p></p><pre><code>  I've become convinced that cancer is among the elite series of diseases that are, \n  in many cases, just how people die, meaning that perhaps in many instances the medical \n  term for \"dying\" is \"cancer\".\n</code></pre>\nOur bodies are machines. Biological and very complex machines, but still they follow a system of rules and their functions are defined in machine code. Cancer is a certain type of crash that can befall these machines, literally. As the cells are executing their DNA code, an error creeps into its daily routine.<p>There is a variety of reasons those bugs can come up: for example, the codebase could have a pre-existing weakness that gets triggered in certain conditions. Sometimes, the code was copied incorrectly from one cell to its successor. Sometimes an external influence corrupts the local copy of the code.</p><p>When cellular code develops a bug, there are a number of things that can happen: sometimes, the cell just becomes bad or inefficient at what it does. Sometimes it shuts down. Sometimes, nothing happens. And other times the bug introduces an infinite loop in the cell's replication subroutines - that's cancer.</p><p>You see, cancer is neither a medical catchall term nor is it an inevitability of life. In fact, our immune system regularly attacks crashed cells, including cancer cells. If it didn't we'd all be having cancer at a very early age. However, sometimes due to the nature of the bug, the immune system is incapable of recognizing that a cell has crashed. That's when cancer breaks out, because those cells replicate and the immune system doesn't stop them. This is also precisely the point where the most promising treatment options are. We are just now figuring out how to teach the immune system to recognize those crashed cells and once we advance this research enough, we'll have the capability to simply correct these flaws in our systems and get rid of the bug completely.</p><p></p><pre><code>  I once read the supposed confession of a medical research assistant that \"cancer\"\n  as a general thing is not curable but they keep the myth alive because \"cure cancer\" \n  makes a really decent slogan.\n</code></pre>\nFor your sake, I really hope you don't believe this nonsense. It's right up there with \"the Earth is flat\" and \"God did it\".<p>EDIT: After re-reading my post, I realize that it could be perceived as condescending - but I assure you, it's not supposed to be. It's just intended as a short programmer-friendly introduction into the nature of cancer.\n              </p>"
      },
      {
        "indent": 3,
        "user": "nlogn",
        "age": "on Oct 6, 2011",
        "comment": "Especially since we as a species have eliminated so many other \"natural\" causes of death thanks to vaccines, antibiotics, sanitation etc.  What we are left with are what we have not yet solved: cancer, heart disease and strokes (mostly).\n<a href=\"http://imgur.com/6d3lK\" rel=\"nofollow\">http://imgur.com/6d3lK</a><p>Cancer also becomes naturally more likely as time goes on and DNA has become more damaged so as our lifespans increase, so do the odds of getting cancer.\n              </p>"
      },
      {
        "indent": 3,
        "user": "Gatsky",
        "age": "on Oct 6, 2011",
        "comment": "I wouldn't agree that cancer is just a fact of life. Here's why:<p>1. Young people get cancer, when they are otherwise healthy.</p><p>2. Cancer is subject to epidemiological trends suggesting that there are definite causes related to lifestyle or the environment.</p><p>3. You can reduce your risk of cancer/dying of cancer by not smoking, exercise, maintaining a normal body weight, and participating in screening programs. There are no guarantees of course.</p><p>4. Some cancers are curable eg testicular cancer can be cured even if widespread, with chemotherapy. Also Hodgkin's lymphoma and of course early stage cancer of the breast and bowel.</p><p>Incidentally, Steve Jobs had a pancreatic neuroendocrine tumour, which is distinct from the normal run of the mill pancreatic cancer that has a poorer prognosis.\n              </p>"
      },
      {
        "indent": 4,
        "user": "muyyatin",
        "age": "on Oct 6, 2011",
        "comment": "It seems like the statement of (1) is an admission that we aren't accurate at evaluating whether someone is \"healthy\" or \"not healthy\" to an acceptable level yet, since I would include precursors to cancer in my \"healthy\" classification."
      },
      {
        "indent": 3,
        "user": "philwelch",
        "age": "on Oct 6, 2011",
        "comment": "Cancer's definitely more of a specific thing than you think, as other comments have pointed out, but it is more or less a common failure mode of mammals, and statistically, it will eventually happen to you if nothing else does."
      },
      {
        "indent": 3,
        "user": "jarek",
        "age": "on Oct 6, 2011",
        "comment": "PHD Comics making a similar statement: <a href=\"http://www.phdcomics.com/comics.php?f=1162\" rel=\"nofollow\">http://www.phdcomics.com/comics.php?f=1162</a>"
      },
      {
        "indent": 3,
        "user": "rorrr",
        "age": "on Oct 6, 2011",
        "comment": "You're right, cancer is not just one disease.<p>Aging will probably get solved relatively soon, as will cancer, we just need the technology.</p><p><a href=\"http://www.ted.com/talks/aubrey_de_grey_says_we_can_avoid_aging.html\" rel=\"nofollow\">http://www.ted.com/talks/aubrey_de_grey_says_we_can_avoid_ag...</a>\n              </p>"
      },
      {
        "indent": 0,
        "user": "chetan51",
        "age": "on Oct 6, 2011",
        "comment": "Here’s to the crazy ones. The misfits. The rebels. The troublemakers. The round pegs in the square holes. The ones who see things differently. They’re not fond of rules. And they have no respect for the status quo. You can quote them, disagree with them, glorify or vilify them. About the only thing you can’t do is ignore them. Because they change things. They push the human race forward. And while some may see them as the crazy ones, we see genius. Because the people who are crazy enough to think they can change the world, are the ones who do. - Apple Inc."
      },
      {
        "indent": 0,
        "user": "MatthewB",
        "age": "on Oct 6, 2011",
        "comment": "I (along with countless other people) lost a hero today.<p>Steve Jobs was the person who inspired me to join the tech industry. I first really knew who Steve Jobs was after watching the (not so bad) made-for-tv movie \"Pirates of Silicon Valley.\" I always knew I wanted to work with technology but after seeing that movie I knew I wanted to be part of the Silicon Valley culture that Steve helped create. Steve has inspired me for years and I am extremely sad about this loss. We will all miss him dearly.</p><p>RIP Steve Jobs \n              </p>"
      },
      {
        "indent": 0,
        "user": "edw519",
        "age": "on Oct 6, 2011",
        "comment": "\"I want to put a ding in the universe.\"<p>Perhaps his biggest ding was inspiring so many of us to pursue our own dings.</p><p>R.I.P.\n              </p>"
      },
      {
        "indent": 1,
        "user": "aespinoza",
        "age": "on Oct 6, 2011",
        "comment": "So true."
      },
      {
        "indent": 1,
        "user": "nirvana",
        "age": "on Oct 6, 2011",
        "comment": "Sorry to be pedantic, but it was dent.  \"Do[n't] you want to make a dent in the universe?\""
      },
      {
        "indent": 2,
        "user": "speleding",
        "age": "on Oct 6, 2011",
        "comment": "It was \"ding\" according to most sources that come up in Google\n<a href=\"http://quotationsbook.com/quote/215/\" rel=\"nofollow\">http://quotationsbook.com/quote/215/</a>"
      },
      {
        "indent": 2,
        "user": "debt",
        "age": "on Oct 9, 2011",
        "comment": "The original was right, but I think it was dong.  Steve said \"I want to put a dong in the universe.\""
      },
      {
        "indent": 0,
        "user": "protomyth",
        "age": "on Oct 6, 2011",
        "comment": "In the early 90's I was pretty sure I didn't want be a programmer anymore.  I really got no joy from Windows and the Macintosh was looking like it was dead.  I got ahold of NeXTSTEP 3.3 and was hooked.  I remember the joy stuff like the Apple II and the Atari 400 brought me.  It was just amazing.  It is such a shame to know Steve Jobs, Seymour Cray, and Jay Miner are no longer with us.  I should be happy to have been alive for the start of it all though."
      },
      {
        "indent": 0,
        "user": "orky56",
        "age": "on Oct 6, 2011",
        "comment": "He poured his life and soul into Apple. When his health suffered, he fought tooth and nail and stayed involved with Apple until the very end. When he left Apple (feels like just yesterday), he said it was because he truly felt he was unable to continue to lead.<p>I'm left with a feeling of ambivalence. I feel bad that he couldn't enjoy the fruits of his labor by retiring and spending time with his family or whatever other interests he had. At the same time, I know that he wouldn't have had it any other way.</p><p>He recognized his gift and shared it with all of us. The experiences when using his products and the emotions when hearing him speak. I feel blessed just to have been a witness to such a human's life.\n              </p>"
      },
      {
        "indent": 0,
        "user": "rufugee",
        "age": "on Oct 6, 2011",
        "comment": "I'd be lying if I said I was a big Apple fan. I'm a Linux guy and never saw a need or benefit to pay the premium required for entry through the Apple gates (well, ok, I bought a Macbook for iPhone development, but I didn't enjoy it).<p>That said, Steve was a great force in the world of technology, and whether you liked their products or not, you have to appreciate Apple's effect on competition in the marketplace...they simply continue to push the envelope, and technology wouldn't be what it is today with Steve and his creations. RIP.\n              </p>"
      },
      {
        "indent": 1,
        "user": "elliottcarlson",
        "age": "on Oct 6, 2011",
        "comment": "Well said - the only Apple product I've had are iPod's and I have no desire to use Macs, but Jobs did make a huge dent and shaped a lot of people all over the world. It's a sad day when a visionary like him passes."
      },
      {
        "indent": 0,
        "user": "abstractwater",
        "age": "on Oct 6, 2011",
        "comment": "I am truly surprised at how sad I am. Even if I disagreed on some of the decisions made by Apple (App Store review process, etc) he was to me the most inspirational man alive. What a devastating loss.<p>A part of me can't help to think that Apple is now just a \"normal\" company. But I hope his charisma and vision will stick and be strong enough to live on for many more decades in Cupertino.\n              </p>"
      },
      {
        "indent": 0,
        "user": "Jun8",
        "age": "on Oct 6, 2011",
        "comment": "Ahh, I just posted a comment about missing Steve after seeing the photos of the other guys announcing various stuff. I have never met him, or even saw him in person, but probably wouldn't have liked him personally; he was despotic and narcissistic. And people still debate various heavy-handed ways Apple deals with a lot aspects of their ecosystem.<p>Despite all this, sitting in my living room, I am totally devastated by these news! This is true greatness.\n              </p>"
      },
      {
        "indent": 0,
        "user": "nhangen",
        "age": "on Oct 6, 2011",
        "comment": "Wow, this makes me really effing sad. What's worse is no one in my family understands, so it's like going into mourning solo. Bummer...<p>RIP Steve\n              </p>"
      },
      {
        "indent": 1,
        "user": "cyberguppy",
        "age": "on Oct 6, 2011",
        "comment": "My wife understands, even if she could never fully Understand. But that's why we're parts of communities like this one. We all Understand."
      },
      {
        "indent": 2,
        "user": "nhangen",
        "age": "on Oct 6, 2011",
        "comment": "Well said my friend."
      },
      {
        "indent": 2,
        "user": "dpritchett",
        "age": "on Oct 6, 2011",
        "comment": "As soon as I saw the news I headed to HN to share in the moment.<p>The site slowed to a crawl, pg kept things afloat by dialing back the number of stories on the front page, the black bar came out, and here we all are.\n              </p>"
      },
      {
        "indent": 0,
        "user": "andrewl",
        "age": "on Oct 6, 2011",
        "comment": "He gave me a bicycle for my mind. That's a powerful gift, and I'm grateful."
      },
      {
        "indent": 0,
        "user": "ojbyrne",
        "age": "on Oct 6, 2011",
        "comment": "Someone I knew said a while back \"No tech company has ever come back from decline.\" I immediately thought of (what I feel is now the canonical counterexample) Apple. So many tech companies, and CEOs who have never been acquainted with  failure, and have arrogance that's mostly a result of being in the right place and the right time.<p>And one who was fired, watched his company driven right to the precipice, and brought it back.</p><p>The arc of a hero.</p><p>August 6, 1997. Greatness doesn't happen at the top but at the bottom: \n<a href=\"http://news.cnet.com/2100-1001-202143.html\" rel=\"nofollow\">http://news.cnet.com/2100-1001-202143.html</a>\n              </p>"
      },
      {
        "indent": 1,
        "user": "eropple",
        "age": "on Oct 6, 2011",
        "comment": "Apple and Jobs is probably the biggest turnaround in the history of tech companies, but IBM was in pretty dire straits too, not that long ago.<p>(But I like Apple more. ;) )\n              </p>"
      },
      {
        "indent": 0,
        "user": "spudlyo",
        "age": "on Oct 6, 2011",
        "comment": "I'm deeply and unexpectedly saddened by the news.  Recently while taking a cab from SFO into the city I monitored our progress on the iPhone maps app, and had a profound feeling that I was living in the future I had dreamed about as a kid.  Thank you Steve."
      },
      {
        "indent": 0,
        "user": "cilantro",
        "age": "on Oct 5, 2011",
        "comment": "My first computer was a Macintosh Plus at age ~5. Not sure what I would be doing with my life without his contribution."
      },
      {
        "indent": 1,
        "user": "equalarrow",
        "age": "on Oct 6, 2011",
        "comment": "Yah, my first program was done in an Apple ][+. My friend and I grew up programming on his various Apple machines (I had a Commodore 64).<p>For the past 10 years I've made a living developing on all kinds of Macs. Couldn't imagine work without them.</p><p>Best of all, I loved watching Steve's keynotes. No one can distort reality the way he did.</p><p>I didn't even know him, but I feel like I'll miss knowing he's there, ready to present:</p><p>\"one more thing..\"\n              </p>"
      },
      {
        "indent": 1,
        "user": "ilamont",
        "age": "on Oct 6, 2011",
        "comment": "I can see that I am not the only one whose life was changed by those early experiences with the Apple ecosystem. From my own 30-year-old memories:<p>On any given afternoon around 1981-1982, the geeks at my middle school could all be found gathered around a dozen Apple II+ and Apple IIe machines in the computer room. The British instructor who had set them up and taught us code  fundamentals really encouraged us to explore and experiment (and fought a losing battle to keep us from bringing our game floppies into the room).\n              </p>"
      },
      {
        "indent": 1,
        "user": "ebrenes",
        "age": "on Oct 6, 2011",
        "comment": "Mine was an Apple IIe, and likewise it really opened my eyes to the world of computing and gave me a life long passion for technology.<p>I thank him for that as well.\n              </p>"
      },
      {
        "indent": 1,
        "user": "mcclung",
        "age": "on Oct 6, 2011",
        "comment": "My first was an Apple IIe at age 12.  I was thinking the same thing."
      },
      {
        "indent": 1,
        "user": "earl",
        "age": "on Oct 6, 2011",
        "comment": "I'm another dev whose first computer was an apple IIgs.  I don't know if I'd be a dev today if I hadn't spent far too many hours poking around in basic typing in games from magazine, modifying them, and writing my own.<p>For purely selfish reasons -- what could Steve have imagined next? -- he passed far too soon.\n              </p>"
      },
      {
        "indent": 2,
        "user": "vacri",
        "age": "on Oct 6, 2011",
        "comment": "Given that it takes years for a big thing to pass through the dev cycle and come to market, you're still going to see some things that were up his sleeve."
      },
      {
        "indent": 1,
        "user": "ebrenes",
        "age": "on Oct 6, 2011",
        "comment": "Mine was an Apple IIe, and likewise it really opened my eyes to the world of computing and gave me a life long passion for technology.<p>I thank him for that as well.\n              </p>"
      },
      {
        "indent": 1,
        "user": "ebrenes",
        "age": "on Oct 6, 2011",
        "comment": "Mine was an Apple IIe, and likewise it really opened my eyes to the world of computing and gave me a life long passion for technology.<p>I thank him for that as well.\n              </p>"
      },
      {
        "indent": 0,
        "user": "_d8fd",
        "age": "on Oct 6, 2011",
        "comment": "I was a PC guy for 26 years, making fun of Apples/Macs for most of that time.  Eventually Macs became so awesome that I couldn't help but love them.  Jobs was able to convert me, and that wasn't an easy thing to do."
      },
      {
        "indent": 0,
        "user": "achompas",
        "age": "on Oct 6, 2011",
        "comment": "I wanted to post this great anecdote from Metafilter:<p><i>Here’s a short tale of mine when I worked at Apple:</i></p><p><i>One sunny autumn day, Steve (he was always Steve) was walking across Apple’s campus with a reporter toward Caffe Macs. I was walking a few feet behind, enough to hear the reporter asking about Steve’s family. As we approached the entrance, Steve stopped and opened the door for an employee carrying trays of food outside. The employee never looked up but said \"Thanks.\" \"Sure,\" Steve replied. Just then, at least two dozen people followed the employee out. Because of where the reporter was standing, none of the employees (as far as I could tell) noticed who was holding the door for them. Steve continued holding that door, talking to the reporter, until I came up and offered to take his place as doorman. \"Thanks,\" he said. \"Sure,\" I replied. He smiled and invited the reporter inside.</i></p><p><i>That’s it.</i></p><p><i>Whatever else you may read about Steve, whatever else happens in his life or to Apple or to the world of computing, know that he opened doors for people.</i></p><p><i>R.I.P. Steve. We're all better off thanks to your time on the planet.</i></p><p>(credit to kawika, link below)</p><p><a href=\"http://www.metafilter.com/108093/Steve-Jobs-RIP#3958050\" rel=\"nofollow\">http://www.metafilter.com/108093/Steve-Jobs-RIP#3958050</a>\n              </p>"
      },
      {
        "indent": 0,
        "user": "diogenescynic",
        "age": "on Oct 6, 2011",
        "comment": "He made the world a better place and he was our generation's Walt Disney, Howard Hughes, Thomas Edison, Jack Welch, and Henry Ford all at once. Revolutionized multiple industries.<p>He will be sorely missed.\n              </p>"
      },
      {
        "indent": 0,
        "user": "ltamake",
        "age": "on Oct 6, 2011",
        "comment": "I just realised something. Steve won't ever see the new Apple building in Cupertino (the \"spaceship\" one). :'("
      },
      {
        "indent": 1,
        "user": "bengl3rt",
        "age": "on Oct 6, 2011",
        "comment": "Nor will he get to live in his dream house, which he finally got permission to build on a specific spot in Palo Alto last year."
      },
      {
        "indent": 0,
        "user": "gokhan",
        "age": "on Oct 5, 2011",
        "comment": "He was 56 years old, too young to die :("
      },
      {
        "indent": 0,
        "user": "scarmig",
        "age": "on Oct 6, 2011",
        "comment": "One has to wonder what he might have accomplished with a full life span.<p>What he managed to do, though, is genuinely incredible, and he has much to be proud of. He made the world more beautiful.</p><p>RIP, Steve.\n              </p>"
      },
      {
        "indent": 1,
        "user": "ConstantineXVI",
        "age": "on Oct 6, 2011",
        "comment": "Not to play devil's advocate, but you have to wonder if he'd have kept the same drive for so long if he knew he was going to have a full ~80 years?"
      },
      {
        "indent": 2,
        "user": "julsonl",
        "age": "on Oct 6, 2011",
        "comment": "Well, he certainly had the drive when he started Apple. Based from what I read about him, it hasn't diminished until the day he died. I'm sure he could've kept it going for another 30."
      },
      {
        "indent": 0,
        "user": "pixelcloud",
        "age": "on Oct 6, 2011",
        "comment": "\"If I were running Apple, I would milk the Macintosh for all it's worth -- and get busy on the next great thing. The PC wars are over. Done. Microsoft won a long time ago.\"\n--Steve Jobs - Fortune, Feb. 19, 1996"
      },
      {
        "indent": 1,
        "user": "Udo",
        "age": "on Oct 6, 2011",
        "comment": "And luckily he was wrong about that :-)"
      },
      {
        "indent": 2,
        "user": "ricardobeat",
        "age": "on Oct 7, 2011",
        "comment": "He wasn't. The desktop market will be reduced to a small slice of technology before Apple has a chance to catch up. It won't matter."
      },
      {
        "indent": 0,
        "user": "PedroCandeias",
        "age": "on Oct 6, 2011",
        "comment": "Just adding my voice to the millions who will be mourning the man and the visionary. As someone who works with computers for a living, I'm thankful for the beautiful tools his company created. As an entrepreneur, I'm intrigued and moved by his example."
      },
      {
        "indent": 0,
        "user": "xelipe",
        "age": "on Oct 6, 2011",
        "comment": "What amazes me most about his life is that he revolutionized on so many fronts and his innovations have helped people of all walks of life. Pixar movies have entertained children of all ages, the iPhone market has been a great resource for educational tools to help children with disabilities, and he did so with style. (;_;)"
      },
      {
        "indent": 0,
        "user": "juliano_q",
        "age": "on Oct 6, 2011",
        "comment": "I am not the biggest Apple fan. I love my macbook and I have a very old iPod, but in the last few years I misliked the company attitude. Even so, suddenly I feel that the world is a worst place to live. RIP Steve."
      },
      {
        "indent": 0,
        "user": "RegEx",
        "age": "on Oct 6, 2011",
        "comment": "A very respectable tribute, right down to the img src.<p><a href=\"http://images.apple.com/home/images/t_hero.png\" rel=\"nofollow\">http://images.apple.com/home/images/t_hero.png</a>\n              </p>"
      },
      {
        "indent": 1,
        "user": "naz",
        "age": "on Oct 6, 2011",
        "comment": "\"hero\" is a standard term for that kind of image size and position in print and on the web."
      },
      {
        "indent": 2,
        "user": "RegEx",
        "age": "on Oct 6, 2011",
        "comment": "Ah. Thanks for the info."
      },
      {
        "indent": 1,
        "user": "enneff",
        "age": "on Oct 6, 2011",
        "comment": "<a href=\"http://www.urbandictionary.com/define.php?term=hero%20image\" rel=\"nofollow\">http://www.urbandictionary.com/define.php?term=hero%20image</a>"
      },
      {
        "indent": 0,
        "user": "Folcon",
        "age": "on Oct 6, 2011",
        "comment": "I am not an Apple fan, I say that because I own no iPad, iPhone, iPod or iMac.<p>As someone who is starting and striving to build beautiful software and become an entrepreneur, Jobs is an inspiration.</p><p>He has done more than few could hope to achieve.</p><p>I feel saying anything else will just sound corny, which is not what he deserves.</p><p>So RIP Steve.\n              </p>"
      },
      {
        "indent": 0,
        "user": "quizbiz",
        "age": "on Oct 6, 2011",
        "comment": "As General Electric innovates well beyond Thomas Edison, I look forward to watching Apple continue to push society forward. Steve Jobs will in some ways live on through the Apple brand, as a symbol for so many things that resonate so strongly, I can't even express it."
      },
      {
        "indent": 0,
        "user": "juliano_q",
        "age": "on Oct 6, 2011",
        "comment": "<i>Every</i> single link at HN frontpage is about Jobs passage atm. It may looks obvious, but look at the importance of the guy between hackers. RIP."
      },
      {
        "indent": 1,
        "user": "zipdog",
        "age": "on Oct 6, 2011",
        "comment": "I saw the sad news on another site and came here for confirmation: saw every single story was about Steve Jobs, and then reflected how appropriate it was. There's few people of the stature of Steve Jobs."
      },
      {
        "indent": 1,
        "user": "mdonahoe",
        "age": "on Oct 6, 2011",
        "comment": "As I was typing the hacker news url, I wondered how many top stories would be about steve, but I did not expect all of them."
      },
      {
        "indent": 0,
        "user": "geuis",
        "age": "on Oct 6, 2011",
        "comment": "This wasn't the \"One more thing...\" that I wanted."
      },
      {
        "indent": 0,
        "user": "aresant",
        "age": "on Oct 6, 2011",
        "comment": "Even the .png name on Apple's site is appropriate:<p><a href=\"http://images.apple.com/home/images/t_hero.png\" rel=\"nofollow\">http://images.apple.com/home/images/t_hero.png</a></p><p>Here's to you Steve, thank you for the inspiration over my lifetime.\n              </p>"
      },
      {
        "indent": 1,
        "user": "masklinn",
        "age": "on Oct 6, 2011",
        "comment": "That's just the name of this banner format though, I don't think it has to do with Jobs himself/"
      },
      {
        "indent": 2,
        "user": "dragonquest",
        "age": "on Oct 6, 2011",
        "comment": "True, but how co-incidentally appropriate, truly a hero!"
      },
      {
        "indent": 0,
        "user": "artursapek",
        "age": "on Oct 6, 2011",
        "comment": "Is the black bar that just appeared at the top of HN a symbol for Steve's passing?"
      },
      {
        "indent": 1,
        "user": "nplusone",
        "age": "on Oct 6, 2011",
        "comment": "It is. See <a href=\"http://news.ycombinator.com/item?id=3078285\" rel=\"nofollow\">http://news.ycombinator.com/item?id=3078285</a>"
      },
      {
        "indent": 0,
        "user": "ericd",
        "age": "on Oct 6, 2011",
        "comment": "My dad buying a Mac 128k and letting me run wild with it was probably one of the most influential events in my life. It taught me to read, it taught me math, and it kicked off a lifelong passion for computers and programming. It's amazing to me that they designed a computer that I didn't even have to know how to read to interact with. I can't believe I'm getting so emotional about a person I've never met, but I'm almost tearing up."
      },
      {
        "indent": 0,
        "user": "natemartin",
        "age": "on Oct 6, 2011",
        "comment": "The news is hitting me harder than I expected. More than just the products he made, I feel that he directly effected my life. I wouldn't be where I am in my life today, certainly would have the job I have today, if it wasn't for the years I spent at Apple. And I wouldn't have worked there if Steve hadn't first created the company, then later on saved it.<p>RIP SJ. You certainly changed the world.\n              </p>"
      },
      {
        "indent": 0,
        "user": "thought_alarm",
        "age": "on Oct 6, 2011",
        "comment": "Thank you, Steve.<p><a href=\"http://img72.imageshack.us/img72/6128/04nextcube.jpg\" rel=\"nofollow\">http://img72.imageshack.us/img72/6128/04nextcube.jpg</a>\n              </p>"
      },
      {
        "indent": 1,
        "user": "RexRollman",
        "age": "on Oct 6, 2011",
        "comment": "Very nice. Most people love Steve for his work at Apple, and rightfully so, but I was always a bigger fan of his work at Next (I'm one of those weirdos who liked Nextstep more than Mac OS X; from a UI perspective)."
      },
      {
        "indent": 1,
        "user": "equalarrow",
        "age": "on Oct 6, 2011",
        "comment": "God, NeXTStep was awesome.. I used Windowmaker for years on Linux until I transitioned to OSX.<p>NSObject.\n              </p>"
      },
      {
        "indent": 0,
        "user": "jianshen",
        "age": "on Oct 5, 2011",
        "comment": "This makes me really really sad deep inside. What an incredible journey."
      },
      {
        "indent": 0,
        "user": "dabent",
        "age": "on Oct 6, 2011",
        "comment": "From playing on an Apple][ on middle school to typing this on a Mac - Steve Jobs certainly influenced me as a developer.  So many times the world seemed to chase the designs he pioneered or pushed into the mainstream.  Without his leadership and his effective counterweight to Microsoft and IBM, the world would have been much different."
      },
      {
        "indent": 0,
        "user": "mitultiwari",
        "age": "on Oct 6, 2011",
        "comment": "“Being the richest man in the cemetery doesn’t matter to me … Going to bed at night saying we’ve done something wonderful… that’s what matters to me.” -- Steve Jobs. RIP."
      },
      {
        "indent": 0,
        "user": "Duff",
        "age": "on Oct 6, 2011",
        "comment": "Mr. Jobs will be well remembered. It's also sad in that his passing is among the first of a generation of pioneers in this crazy industry we all work in.<p>Best wishes to his family.\n              </p>"
      },
      {
        "indent": 0,
        "user": "larrys",
        "age": "on Oct 6, 2011",
        "comment": "Having written my first (if you want to call it that) program\non a ASR-33 Teletype and remembering back when computers were not only\nexpensive but certainly not mainstream (and not cool to the\nmasses anyway) it's amazing what Jobs and Apple were able to do in\nthe last decade.  Who would ever think that this \"thing\" that\nsome of us had so much fun with back then would be so accepted \nand talked about by everyone today. That there would be so much adulation for someone, actually anyone, in this industry? If you're not old enough to remember the way it was back many years ago we're really living in a special time right now.  And Steve is certainly the reason for\nmuch of that."
      },
      {
        "indent": 0,
        "user": "InclinedPlane",
        "age": "on Oct 5, 2011",
        "comment": "Not a perfect man (who, even among the great, is?), but in his own way he did his fair share for the betterment of mankind. He helped people connect with each other, he helped people do their jobs, he helped people make art. We should all be so lucky."
      },
      {
        "indent": 0,
        "user": "sharmajai",
        "age": "on Oct 6, 2011",
        "comment": "I have never met Steve Jobs in person, yet I am deeply saddened by this news, this does not happen very often.<p>Thank you Steve for being an inspiration in our lives and making the world a better place. You will be missed forever. Rest in peace.</p><p>My condoloences to your family.\n              </p>"
      },
      {
        "indent": 0,
        "user": "steve19",
        "age": "on Oct 6, 2011",
        "comment": "I am sad. Sad for Steve, sad for Steve's family, sad for how he could have changed the world if he lived another 50 years and also sad, selfishly maybe, that I will never have the opportunity to meet him.<p>RIP Steve, you inspired us and we loved you for it.\n              </p>"
      },
      {
        "indent": 1,
        "user": "outworlder",
        "age": "on Oct 6, 2011",
        "comment": "This does mimic a conversation I've just had at our startup. We won't have the privilege of seeing what was he really like.<p>Congratulations to all of those who had that opportunity. The rest of us will have to make do with a mere shadow of his personality.</p><p>But what a remarkable shadow it is.\n              </p>"
      },
      {
        "indent": 0,
        "user": "yojimbo311",
        "age": "on Oct 6, 2011",
        "comment": "This really made the world a little less bright for me today.<p>RIP Steve. Thank you for everything you've done to bring your magic to the world. Thank you also for things you haven't done, but easily could have.\n              </p>"
      },
      {
        "indent": 0,
        "user": "mwill",
        "age": "on Oct 6, 2011",
        "comment": "He stood down from Apple less than 2 months ago, I wonder if he had any idea how close he was cutting it.<p>No matter how you slice it, the man loved what he did, and he did it brilliantly. The amount of people who use a device designed under his watch every single day of their lives is utterly astounding, through his work, he connected with hundreds of millions of people, and changed the game of consumer electronics numerous times.</p><p>I hope I can have a even a small sliver of his passion, commitment, and vision in my own life.\n              </p>"
      },
      {
        "indent": 1,
        "user": "Udo",
        "age": "on Oct 6, 2011",
        "comment": "&gt; He stood down from Apple less than 2 months ago, I wonder if he had any idea how close he was cutting it.<p>Of course he did. I think he held onto this thing until the very last second. I wouldn't be surprised if the actual resignation wasn't a long-ago prepared statement sitting in his lawyer's drawer for years. End-stage liver disease also means a rapid mental decline, so I'm assuming they triggered the resignation as soon as he was irreversibly incapacitated.\n              </p>"
      },
      {
        "indent": 2,
        "user": "philwelch",
        "age": "on Oct 6, 2011",
        "comment": "That's really sad to think about. I hope he had the chance to appreciate the iPhone announcement yesterday, even though he couldn't make it."
      },
      {
        "indent": 3,
        "user": "Udo",
        "age": "on Oct 6, 2011",
        "comment": "As morbid as this sounds, he probably died yesterday morning - the close timing to the iPhone event suggests they held off on announcing his death so as not to overshadow the product announcement.<p>I have seen a few patients with end-stage liver disease during their last days and I have to say they don't recognize their surroundings nor are they capable of reflecting on their own state. And this is a good thing probably. At times like these, it helps me to remember that lives are not defined by their endings, they are defined by how they have been lived.\n              </p>"
      },
      {
        "indent": 0,
        "user": "47",
        "age": "on Oct 5, 2011",
        "comment": "Steven Paul \"Steve\" Jobs will be remembered as the greatest inventor and entrepreneur of our era."
      },
      {
        "indent": 1,
        "user": "jleyank",
        "age": "on Oct 6, 2011",
        "comment": "No, he won't.  And I think you know that if you stop and think about it.  Bill or Larry or Sam or people like that fit that category.  However, Steve Jobs might have been the only one who gave a %!&amp;#% about his products: what they did, how they worked and what people could do with them."
      },
      {
        "indent": 2,
        "user": "petercooper",
        "age": "on Oct 6, 2011",
        "comment": "As an entrepreneur, he founded the now largest company on the planet, founded a company that sold for $400m, and took Pixar from almost nothing to a $7bn acquisition by Disney.<p>As an inventor, he's the main name (though with significant help and industrial design by others) behind the iMac, iPod, iPad, iPhone - all dominant leaders in their respective sectors.</p><p>It's curious that you'd put Larry Ellison's achievements above all of that.\n              </p>"
      },
      {
        "indent": 3,
        "user": "jleyank",
        "age": "on Oct 6, 2011",
        "comment": "I stopped while typing and thought who was \"big\".  I wasn't addressing the inventor portion, merely the entrepreneur.  Mr. Gates or Mr. Walton had far greater impact on the world as a whole than Mr. Jobs.  Mr. Ellison came to mind, as I wanted a few more names to add to the list.  Guys like Buffett aren't in this category, and I could not think of other industry players of the last 20-30 years.<p>I'd be willing to bet that the Amazon guy might end up on this list if current trends continue, as continued Amazon success might have the hollowing-out impact of Wal-Mart.  And you missed the point I was trying to make.  Jobs is different because he actually saw the product as more than a dollar sign.  His \"score\" was lower because of this, but we're all applauding his decision tonight.</p><p>And I don't count the computer or consumer electronics field as the best source of inventors.  The latter, in many ways, is noise.  The true inventions of the former occurred outside our date window (transistor, IC, microprocessor, ...)  To me, inventions like PCR, medical/biology/chemistry/computer syntheses or vaccines are better, more significant inventions.</p><p>Hell, Sony broke the ground with the Walkman.  Roddenberry thought up the iPad in a way.  But, again, Jobs had taste and he made sure (a) we knew that and (b) his products were intended to be more than revenue streams.</p><p>As a postscript, I suspect there's far, far more businesses sitting on piles of Oracle software than they'd like (but they're stuck and getting nailed for it).\n              </p>"
      },
      {
        "indent": 0,
        "user": "happypeter",
        "age": "on Oct 6, 2011",
        "comment": "This means a lot to me<p>\"Your work is going to fill a large part of your life, and the only way to be\ntruly satisfied is to do what you believe is great work, and the only way to\ndo great work is to love what you do. If you haven't found it yet, keep\nlooking, and don't settle. As with all matters of the heart, you'll know when\nyou find it, and like any great relationship it just gets better and better as\nthe years roll on. So keep looking. Don't settle.\"</p><p>June 12th 2005 Stanford commencement speech\n              </p>"
      },
      {
        "indent": 0,
        "user": "mantas",
        "age": "on Oct 6, 2011",
        "comment": "Steve Jobs was my idol since I knew who he is and what Apple is. He showed me it's possible to live one's dream and that it's ok to follow your heart. And that it's the only way to be happy and bring happiness to others. Furthermore, his products showed me that it's possible to create easy to use and beautiful software.<p>And that's what I ended up trying to do.. Thank you Steve and rest in peace.</p><p>I'll do my best to stay hungry, stay foolish.\n              </p>"
      },
      {
        "indent": 0,
        "user": "lewispb",
        "age": "on Oct 6, 2011",
        "comment": "“We don’t get a chance to do that many things, and every one should be really excellent. Because this is our life.\" - Steve Jobs."
      },
      {
        "indent": 0,
        "user": "hesdeadjim",
        "age": "on Oct 6, 2011",
        "comment": "I'm quite sad at this loss -- both for the people he leaves behind and for an industry that desperately needs vision of his caliber.<p>On a personal note, if it weren't for Steve Jobs' relentless determination to revolutionize the mobile industry, I wouldn't have had the opportunity to make a living writing games for a platform I love. Thank you and RIP Steve.\n              </p>"
      },
      {
        "indent": 0,
        "user": "BillPosters",
        "age": "on Oct 6, 2011",
        "comment": "I mostly avoid Macs. I prefer PC. But I dig the iPhone despite the various lock-down restrictions. I moved on to an android phone, and for the most part liked the new freedoms the android offered, but it was a step down in user interface design, general UX and is less \"fun to use\".<p>I'm grateful that Steve invested in Pixar. Those animations are inspiring.</p><p>So for me it's iPhone + Pixar. The rest, with respect,  is just normal computer business - iMacs and so on.  That is, build them cheap in China, sell them expensive in fancy stores with marble floors and huge glass windows.  Not a lot going on there except manufacturing and clever business,  and half-decent product design including the OS if you're a fan of that style of computer.</p><p>But for sure, it's sad he died young and he was obviously a hero to many. I liked his speech to the uni students, he seemed to have a calm outlook and interest in life and death and everything in between.\n              </p>"
      },
      {
        "indent": 0,
        "user": "Udo",
        "age": "on Oct 6, 2011",
        "comment": "In the face of all that he has achieved in his short life, the thing that saddens me most is he won't get to see all the cool technologies and gizmos we'll have in the future. He laid the ground work for a large part of this future, it's so sad that he won't be there to witness (or shape) it."
      },
      {
        "indent": 0,
        "user": "scelerat",
        "age": "on Oct 6, 2011",
        "comment": "Yay Steve Jobs for making a dent in the universe. Inspiring."
      },
      {
        "indent": 0,
        "user": "richardofyork",
        "age": "on Oct 6, 2011",
        "comment": "May your soul continue to create beautiful things in heaven.<p>You have done a great deal for humanity, and for that we are very grateful for your time on earth. You represented the best of human intellect and human drive for perfection. We are inherently imperfect as humans, but you have proven, with fantastic flair and awe, that humans can attain perfection. Perfection is no longer a concept, it is embodied in the iPad, the iPhone, the MAC OSX, the iPod, the MAC Book Pro, and all the ingenious, useful, monumental products you have introduced to our world.</p><p>We stand proud as humans because of you and the few other men and women who have stood strong and lead with courage and change our world for the better. For Ever!</p><p>My condolences to your family, your fans, your friends, and your colleagues.\n              </p>"
      },
      {
        "indent": 0,
        "user": "revorad",
        "age": "on Oct 6, 2011",
        "comment": "I just posted this on my blog, thought I'll share here -<p>The most important lesson from Steve Jobs</p><p>Don't be afraid to be wrong.</p><p>It is sad that the first time I write about Steve Jobs is when he's passed away.</p><p>I've never owned an Apple product. So, my love and respect for Steve is entirely based on the way he lived his life.</p><p>I've always believed that one must do exactly what one loves. Life's too short to waste doing other stuff. What for, anyway? Money? Power? They pale in comparison to the electric feeling of creating something new, something you dreamed up.</p><p>Let people tell you you're crazy. You will probably fail. That's ok.</p><p>Steve failed a lot. But, what kept him going?</p><p>He wasn't afraid to be wrong.</p><p>Don't be afraid to be wrong. Make that dent.</p><p><a href=\"http://giniji.com/hrishi/stevejobs.html\" rel=\"nofollow\">http://giniji.com/hrishi/stevejobs.html</a>\n              </p>"
      },
      {
        "indent": 0,
        "user": "qubot",
        "age": "on Oct 7, 2011",
        "comment": "Jobs lived a life that he will be remembered for, which is a luxury other computing pioneers I could name (Eckert, Mauchley) did not get to enjoy. I am happy for Jobs in this respect, since it leaves a feeling of \"completeness\" that came with his death.<p>However, I would feel more emotionally impacted if Jobs was less egocentric. His world was just that: His world. If something did not meet his vision, he was ready to talk down to it. Even if he was right, his attitude and politics made it difficult for me to really warm up to him.</p><p>All I can say is that I wish his family and friends a good life after their tragedy. Regardless of what I think, they knew a man they will never forget.\n              </p>"
      },
      {
        "indent": 0,
        "user": "navs",
        "age": "on Oct 6, 2011",
        "comment": "One of my dreams was to demo a product in front of Steve Jobs and receive his approval. That'll never be but the mere fact that a man can make me strive for success without ever having met him is a testament to his influence."
      },
      {
        "indent": 0,
        "user": "darkmethod",
        "age": "on Oct 6, 2011",
        "comment": "My first experience with a computer was on an Apple ][. And I'm typing this using my iMac over 30 years later. Good memories.<p>My life (childhood, education, and career) have been touched in tremendously powerful way by this man and his passion.</p><p>RIP Steve.\n              </p>"
      },
      {
        "indent": 0,
        "user": "jfb",
        "age": "on Oct 6, 2011",
        "comment": "I never really met him (thanked him once in person for the shuttle service), but I'm glad that he got an extraordinary second chance -- by all accounts, he wasted not a second of it.  My God rest his immortal soul."
      },
      {
        "indent": 0,
        "user": "alexwolfe",
        "age": "on Oct 6, 2011",
        "comment": "I think it was surprising for many of us how emotional this loss was. There were moments I literally couldn't/wouldn't believe this was happening. Amazing how many people he touched. RIP Steve, we truly miss you."
      },
      {
        "indent": 0,
        "user": "dlss",
        "age": "on Oct 5, 2011",
        "comment": "they took our jobs :("
      },
      {
        "indent": 0,
        "user": "Rotor",
        "age": "on Oct 6, 2011",
        "comment": "Steve Jobs said he wanted to make a dent in the universe. I'd say he achieved that, he fundamentally changed the world of technology. What an amazing journey and legacy to leave behind. Rest in peace Steve."
      },
      {
        "indent": 0,
        "user": "rads",
        "age": "on Oct 6, 2011",
        "comment": "I think I was twelve or thirteen when my parents bought me my own Mac. I didn't know this then, but, besides my parents and close friends, Steve Jobs was one of my most important role models. He made Apple unstoppable, but even during the hard times he had a dead set focus on making products people would really love, even if many others didn't like them. He was so passionate about his job; he loved it so much that it inspires me that one day I can start a business and have a job that I love, making things that other people love. RIP Steve."
      },
      {
        "indent": 0,
        "user": "krishna2",
        "age": "on Oct 6, 2011",
        "comment": "R.I.P Steve Jobs. Thank you for Super Breakout (game) and everything else!<p>And that's how I got inspired to get into computer science, learn programming, to build games like that or do cool stuff with computers.\n              </p>"
      },
      {
        "indent": 1,
        "user": "lawnchair_larry",
        "age": "on Oct 6, 2011",
        "comment": "Your inspiration might actually be Steve Wozniak. It was him that did Super Breakout, not Jobs.<p><i>\"Maybe they had an inkling that he'd actually work on Breakout with Wozniak, who they already knew from his low chip PONG. As Allan later said \"Jobs never did a lick of engineering in his life. He had me snowed. It took years before I figured out that he was getting Woz to 'come in the back door' and do all the work while he got the credit.\"</i></p><p><i>\"The original deadline was met after Wozniak did not sleep for four days straight. In the end 50 chips were removed from Jobs' original design. This equated to a US$5,000 bonus, which Jobs kept secret from Wozniak, instead only paying him $375.\"</i>\n              </p>"
      },
      {
        "indent": 2,
        "user": "DilipJ",
        "age": "on Oct 6, 2011",
        "comment": "Geez. I know it's not good to say anything bad about someone who died, but that plus other things he's done makes me think he's a real ----<p>I hope Woz gets a similar level of recognition and mourning when he passes (decades into the future, hopefully)\n              </p>"
      },
      {
        "indent": 3,
        "user": "mochapixel64",
        "age": "on Oct 6, 2011",
        "comment": "To be fair, he was pretty much a kid at the time."
      },
      {
        "indent": 0,
        "user": "tsycho",
        "age": "on Oct 6, 2011",
        "comment": "I don't know what to say. Even if this was expected at some point, I feel really sad.....wish there were more people around me whom I could share this with....but no one seems to care as much."
      },
      {
        "indent": 0,
        "user": "arc_of_descent",
        "age": "on Oct 6, 2011",
        "comment": "As with most, I'm pleasantly surprised by the emotions in me related to Steve Jobs' death. I've only ever used an iPod. I guess this is testament to the person he was. Screw the tech stuff."
      },
      {
        "indent": 0,
        "user": "axefrog",
        "age": "on Oct 6, 2011",
        "comment": "He worked up until he barely had a month left. That's passion for you."
      },
      {
        "indent": 1,
        "user": "DilipJ",
        "age": "on Oct 6, 2011",
        "comment": "yeah, that's what's so crazy to me. Others would take a trip around the world or something. He was very devoted. Makes me think of that Dylan Thomas poem:<p>\"do not go gentle into that good night,\nrage, rage against the dying of the light. \"\n              </p>"
      },
      {
        "indent": 2,
        "user": "sabat",
        "age": "on Oct 6, 2011",
        "comment": "FWIW, Steve was a fan of Dylan Thomas."
      },
      {
        "indent": 0,
        "user": "Symmetry",
        "age": "on Oct 6, 2011",
        "comment": "Some people have muses that subtly guide them their entire life.  Other people have furious muses that seize them by the scruff of the neck and demand their full attention until a work is completed through spasmodic effort.<p>Steve Jobs seemed to have been possessed by the second type of muse, but one that never let go but just kept driving him.  Even if some of use used few Apple products, Steve had a vision and always kept demonstrating that more was possible, that things could be better than they had been.</p><p>He'll be missed.\n              </p>"
      },
      {
        "indent": 0,
        "user": "jpastika",
        "age": "on Oct 6, 2011",
        "comment": "I'm guessing the black bar on top of the HN menu is for Steve Jobs.  Apple is the most incredible comeback story of my lifetime.  Under Jobs, Apple's stock went from $10 to $400.  His dedication to the user experience and unwavering commitment to quality are his traits I most admire and desire to emulate.  Some would say that he didn't get to enjoy his success after conquering the business world, but I believe he enjoyed every moment of the pursuit.  RIP Mr. Jobs."
      },
      {
        "indent": 0,
        "user": "WiseWeasel",
        "age": "on Oct 6, 2011",
        "comment": "I grew up on Macs (starting with a IIcx in the late 80s) and bleed in six colors; this news is extremely hard for me to take.<p>Ultimately, this adds a sense of urgency to my own efforts to start a company and help bring a piece of the future to fruition, as I can no longer count on Steve to get us there.</p><p>Thank you Steve, for your vision, good taste, boundless drive and the inspiration you have given me and countless others. You will be sorely missed. :.(\n              </p>"
      },
      {
        "indent": 0,
        "user": "danvideo",
        "age": "on Oct 5, 2011",
        "comment": "Knew he was sick, but wasn't expecting this.<p>The world has lost a unique and brilliant technology-business-design leader, the likes of which are few and far between.\n              </p>"
      },
      {
        "indent": 0,
        "user": "steve8918",
        "age": "on Oct 6, 2011",
        "comment": "The first computer I saw on a regular basis was my friend's AppleII clone that his dad built somehow.  I distinctly remember the case was made out of wood.  The kid was a jerk though, because he would play Wizardry, and would only let me sit beside him and watch, he would never let me play at all.  Wizardry, Knight of Diamonds and Karateka were the games that I most distinctly remember."
      },
      {
        "indent": 0,
        "user": "hackerbob",
        "age": "on Oct 6, 2011",
        "comment": "I don't even know what to type. I'm just simply sad."
      },
      {
        "indent": 0,
        "user": "rooshdi",
        "age": "on Oct 6, 2011",
        "comment": "\"Almost everything--all external expectations, all pride, all fear of embarrassment or failure--these things just fall away in the face of death, leaving only what is truly important. Remembering that you are going to die is the best way I know to avoid the trap of thinking you have something to lose. You are already naked. There is no reason not to follow your heart.\"<p>Thank you Steve, RIP\n              </p>"
      },
      {
        "indent": 0,
        "user": "darksaga",
        "age": "on Oct 6, 2011",
        "comment": "Wow - what a day. A tweet by CBSNEws says it was wrong when someone tweeted he had died, then I scramble for hours trying to figure out if it was real, and now it has been confirmed by Apple.<p>When I read the news, it really felt like he was hanging on until he knew his company was in good hands and he could pass on. Just an incredible human being in every aspect. He will be sorely missed.\n              </p>"
      },
      {
        "indent": 0,
        "user": "revorad",
        "age": "on Oct 6, 2011",
        "comment": "The final page from an Apple business plan in 1981: <a href=\"http://twitpic.com/6vx2cn\" rel=\"nofollow\">http://twitpic.com/6vx2cn</a>"
      },
      {
        "indent": 0,
        "user": "channelmeter",
        "age": "on Oct 6, 2011",
        "comment": "“The only way to do great work is to love what you do. As with all matters of the heart, you’ll know when you find it.” - Steve Jobs"
      },
      {
        "indent": 0,
        "user": "biot",
        "age": "on Oct 6, 2011",
        "comment": "Fuck cancer for taking a great visionary from us."
      },
      {
        "indent": 0,
        "user": "pyUser",
        "age": "on Oct 6, 2011",
        "comment": "Didn't know it was possible to feel so sad by the death of non-family/friend. RIP Steve. Am lucky to have lived in your era."
      },
      {
        "indent": 0,
        "user": "revorad",
        "age": "on Oct 6, 2011",
        "comment": "Steve, thanks for the dent.<p><a href=\"http://www.youtube.com/watch?v=pD-i-yv-Mz8\" rel=\"nofollow\">http://www.youtube.com/watch?v=pD-i-yv-Mz8</a>\n              </p>"
      },
      {
        "indent": 0,
        "user": "josephcooney",
        "age": "on Oct 6, 2011",
        "comment": "Even if you're not a fan, you can't deny that Steve (through apple) raised the state of the art in industrial and visual design, and user experience with apple products. Your nice Android phone, the books you can buy seamlessly on your kindle and the slick new UI of Windows 8 all owe a small part of their awesomeness to Steve Jobs."
      },
      {
        "indent": 0,
        "user": "dr_",
        "age": "on Oct 6, 2011",
        "comment": "Accomplished more in his 56 years of life than many people do in a full lifetime.<p>Thank you for your vision, creativity and inspiration.\n              </p>"
      },
      {
        "indent": 1,
        "user": "DilipJ",
        "age": "on Oct 6, 2011",
        "comment": "When I look at what he managed to accomplish before he turned 30, it makes me feel like a total loser. But it's also a great source of motivation.<p>also, the Apple homepage really is beautiful in its simplicity. I hope they leave it like this for awhile.\n              </p>"
      }
    ]
	},
  {
    title: 'Show HN: Pure CSS Shaders Art',
    link: 'github.com/chenglou',
    points: 11,
    submitter: 'chenglou',
    submissionDate: '3 months ago',
    comments: [
      {
        "indent": 0,
        "user": "Etheryte",
        "age": "3 months ago",
        "comment": "This is silly, glorious and the exact definition of a great hack. I love it."
      },
      {
        "indent": 0,
        "user": "throw12389",
        "age": "3 months ago",
        "comment": "Clicking on the second demo (Lord of the rings) has bricked my Android phone in FASTBOOT mode... Seems this is some exploit"
      },
      {
        "indent": 1,
        "user": "aaaaaaaaata",
        "age": "3 months ago",
        "comment": "Wait, really?"
      },
      {
        "indent": 2,
        "user": "chenglou",
        "age": "3 months ago",
        "comment": "No not really. It’s just a bunch of spans styles"
      }
    ]
  },
  {
    title: 'Newsom’s shorter bullet train plan likely to run out of money before completion',
    link: 'github.com/chenglou',
    points: 11,
    submitter: 'chenglou',
    submissionDate: '3 months ago',
    comments: [
      {
        "indent": 0,
        "user": "Etheryte",
        "age": "3 months ago",
        "comment": "This is silly, glorious and the exact definition of a great hack. I love it."
      },
      {
        "indent": 0,
        "user": "throw12389",
        "age": "3 months ago",
        "comment": "Clicking on the second demo (Lord of the rings) has bricked my Android phone in FASTBOOT mode... Seems this is some exploit"
      },
      {
        "indent": 1,
        "user": "aaaaaaaaata",
        "age": "3 months ago",
        "comment": "Wait, really?"
      },
      {
        "indent": 2,
        "user": "chenglou",
        "age": "3 months ago",
        "comment": "No not really. It’s just a bunch of spans styles"
      }
    ]
  },
  {
    title: 'Building friend catchers',
    link: 'github.com/chenglou',
    points: 11,
    submitter: 'chenglou',
    submissionDate: '3 months ago',
    comments: [
      {
        "indent": 0,
        "user": "Etheryte",
        "age": "3 months ago",
        "comment": "This is silly, glorious and the exact definition of a great hack. I love it."
      },
      {
        "indent": 0,
        "user": "throw12389",
        "age": "3 months ago",
        "comment": "Clicking on the second demo (Lord of the rings) has bricked my Android phone in FASTBOOT mode... Seems this is some exploit"
      },
      {
        "indent": 1,
        "user": "aaaaaaaaata",
        "age": "3 months ago",
        "comment": "Wait, really?"
      },
      {
        "indent": 2,
        "user": "chenglou",
        "age": "3 months ago",
        "comment": "No not really. It’s just a bunch of spans styles"
      }
    ]
  },
  {
    title: 'We all scream for ice cream',
    link: 'github.com/chenglou',
    points: 11,
    submitter: 'chenglou',
    submissionDate: '3 months ago',
    comments: [
      {
        "indent": 0,
        "user": "Etheryte",
        "age": "3 months ago",
        "comment": "This is silly, glorious and the exact definition of a great hack. I love it."
      },
      {
        "indent": 0,
        "user": "throw12389",
        "age": "3 months ago",
        "comment": "Clicking on the second demo (Lord of the rings) has bricked my Android phone in FASTBOOT mode... Seems this is some exploit"
      },
      {
        "indent": 1,
        "user": "aaaaaaaaata",
        "age": "3 months ago",
        "comment": "Wait, really?"
      },
      {
        "indent": 2,
        "user": "chenglou",
        "age": "3 months ago",
        "comment": "No not really. It’s just a bunch of spans styles"
      }
    ]
  },
  {
    title: 'Surface normals and linear transformations',
    link: 'github.com/chenglou',
    points: 11,
    submitter: 'chenglou',
    submissionDate: '3 months ago',
    comments: [
      {
        "indent": 0,
        "user": "Etheryte",
        "age": "3 months ago",
        "comment": "This is silly, glorious and the exact definition of a great hack. I love it."
      },
      {
        "indent": 0,
        "user": "throw12389",
        "age": "3 months ago",
        "comment": "Clicking on the second demo (Lord of the rings) has bricked my Android phone in FASTBOOT mode... Seems this is some exploit"
      },
      {
        "indent": 1,
        "user": "aaaaaaaaata",
        "age": "3 months ago",
        "comment": "Wait, really?"
      },
      {
        "indent": 2,
        "user": "chenglou",
        "age": "3 months ago",
        "comment": "No not really. It’s just a bunch of spans styles"
      }
    ]
  },
  {
    title: 'Low water stage marks on hunger stones',
    link: 'github.com/chenglou',
    points: 11,
    submitter: 'chenglou',
    submissionDate: '3 months ago',
    comments: [
      {
        "indent": 0,
        "user": "Etheryte",
        "age": "3 months ago",
        "comment": "This is silly, glorious and the exact definition of a great hack. I love it."
      },
      {
        "indent": 0,
        "user": "throw12389",
        "age": "3 months ago",
        "comment": "Clicking on the second demo (Lord of the rings) has bricked my Android phone in FASTBOOT mode... Seems this is some exploit"
      },
      {
        "indent": 1,
        "user": "aaaaaaaaata",
        "age": "3 months ago",
        "comment": "Wait, really?"
      },
      {
        "indent": 2,
        "user": "chenglou",
        "age": "3 months ago",
        "comment": "No not really. It’s just a bunch of spans styles"
      }
    ]
  },
  {
    title: 'Thoughts on ML engineering after a year of my PhD',
    link: 'github.com/chenglou',
    points: 11,
    submitter: 'chenglou',
    submissionDate: '3 months ago',
    comments: [
      {
        "indent": 0,
        "user": "Etheryte",
        "age": "3 months ago",
        "comment": "This is silly, glorious and the exact definition of a great hack. I love it."
      },
      {
        "indent": 0,
        "user": "throw12389",
        "age": "3 months ago",
        "comment": "Clicking on the second demo (Lord of the rings) has bricked my Android phone in FASTBOOT mode... Seems this is some exploit"
      },
      {
        "indent": 1,
        "user": "aaaaaaaaata",
        "age": "3 months ago",
        "comment": "Wait, really?"
      },
      {
        "indent": 2,
        "user": "chenglou",
        "age": "3 months ago",
        "comment": "No not really. It’s just a bunch of spans styles"
      }
    ]
  },
]

// dataRaw[0]!.comments.splice(30, 9999)
// dataRaw = dataRaw.concat(dataRaw)
// dataRaw = dataRaw.concat(dataRaw)
// for (let i = 0; i < 4; i++) dataRaw[0]!.comments = dataRaw[0]!.comments.concat(dataRaw[0]!.comments)
// dataRaw[0]!.comments.forEach((c, i) => c.user = `${i} ${c.user}`)
