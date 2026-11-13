"""Khmer translations for API error messages (selected by the Accept-Language header).

Messages are written in English in the code; this module maps them to Khmer. Dynamic
messages are matched with regular expressions so numbers and names are kept.
"""
import re

KM: dict[str, str] = {
    # auth & account
    "Incorrect email or password": "អ៊ីមែល ឬពាក្យសម្ងាត់មិនត្រឹមត្រូវ",
    "An account with this email already exists": "មានគណនីប្រើអ៊ីមែលនេះរួចហើយ",
    "This account has been disabled": "គណនីនេះត្រូវបានបិទ",
    "This account does not have dashboard access": "គណនីនេះមិនមានសិទ្ធិចូលផ្ទាំងគ្រប់គ្រងទេ",
    "Session expired, please sign in again": "សម័យបានផុតកំណត់ សូមចូលម្តងទៀត",
    "Not signed in": "អ្នកមិនទាន់បានចូលគណនីទេ",
    "Token expired": "សម័យបានផុតកំណត់",
    "Invalid token": "សម័យមិនត្រឹមត្រូវ",
    "Session is no longer valid": "សម័យនេះលែងមានសុពលភាពហើយ",
    "Staff access required": "ត្រូវការសិទ្ធិបុគ្គលិក",
    "Admin access required": "ត្រូវការសិទ្ធិអ្នកគ្រប់គ្រង",
    "Current password is incorrect": "ពាក្យសម្ងាត់បច្ចុប្បន្នមិនត្រឹមត្រូវ",
    "Passwords do not match": "ពាក្យសម្ងាត់មិនដូចគ្នា",
    "Password must contain letters and numbers": "ពាក្យសម្ងាត់ត្រូវមានទាំងអក្សរ និងលេខ",
    "Please accept the terms and conditions": "សូមយល់ព្រមលើលក្ខខណ្ឌប្រើប្រាស់",
    "This reset link is invalid or has expired": "តំណកំណត់ពាក្យសម្ងាត់មិនត្រឹមត្រូវ ឬផុតកំណត់ហើយ",
    "Address not found": "រកមិនឃើញអាសយដ្ឋាន",
    "You can save up to 10 addresses": "អ្នកអាចរក្សាទុកអាសយដ្ឋានបានរហូតដល់ ១០",
    # catalogue / cart / checkout
    "Product not found": "រកមិនឃើញផលិតផល",
    "Please sign in to write a review": "សូមចូលគណនីដើម្បីសរសេរការវាយតម្លៃ",
    "This size/colour is no longer available": "ទំហំ/ពណ៌នេះលែងមានហើយ",
    "Sorry, this size is sold out": "សូមអភ័យទោស ទំហំនេះលក់អស់ហើយ",
    "Item not in cart": "ទំនិញនេះមិននៅក្នុងកន្ត្រកទេ",
    "Option not available": "ជម្រើសនេះមិនមានទេ",
    "Your bag is empty": "កន្ត្រករបស់អ្នកទទេ",
    "This payment method is not available": "វិធីបង់ប្រាក់នេះមិនអាចប្រើបានទេ",
    "Some items in your bag are no longer available. Please review your bag.": "ទំនិញខ្លះក្នុងកន្ត្រកលែងមានហើយ។ សូមពិនិត្យកន្ត្រករបស់អ្នក។",
    "Could not place the order, please try again": "មិនអាចបញ្ជាទិញបានទេ សូមព្យាយាមម្តងទៀត",
    "Order not found": "រកមិនឃើញការបញ្ជាទិញ",
    "We couldn't find an order with those details": "យើងរកមិនឃើញការបញ្ជាទិញតាមព័ត៌មាននេះទេ",
    "This order can no longer be cancelled online. Please contact us.": "ការបញ្ជាទិញនេះមិនអាចលុបចោលតាមអនឡាញបានទៀតទេ។ សូមទាក់ទងមកយើង។",
    "Cash on delivery orders are paid to the courier": "ការបញ្ជាទិញបង់ប្រាក់ពេលទទួលទំនិញ ត្រូវបង់ឱ្យអ្នកដឹកជញ្ជូន",
    "This order does not need a payment submission": "ការបញ្ជាទិញនេះមិនចាំបាច់ផ្ញើព័ត៌មានបង់ប្រាក់ទេ",
    "Add a transaction reference or a screenshot": "សូមបញ្ចូលលេខប្រតិបត្តិការ ឬរូបថតអេក្រង់",
    "This discount code is not valid": "លេខកូដបញ្ចុះតម្លៃនេះមិនត្រឹមត្រូវ",
    "This discount code is not active yet": "លេខកូដបញ្ចុះតម្លៃនេះមិនទាន់ដំណើរការទេ",
    "This discount code has expired": "លេខកូដបញ្ចុះតម្លៃនេះផុតកំណត់ហើយ",
    "This discount code has reached its usage limit": "លេខកូដបញ្ចុះតម្លៃនេះត្រូវបានប្រើគ្រប់ចំនួនហើយ",
    "Too many requests, please slow down and try again shortly.": "សំណើច្រើនពេក សូមរង់ចាំបន្តិច រួចព្យាយាមម្តងទៀត។",
    "Something went wrong on our side. Please try again.": "មានបញ្ហាពីប្រព័ន្ធរបស់យើង។ សូមព្យាយាមម្តងទៀត។",
    "Enter a valid Cambodian phone number, e.g. 012 345 678": "សូមបញ្ចូលលេខទូរស័ព្ទកម្ពុជាឱ្យត្រឹមត្រូវ ឧ. 012 345 678",
    "This does not look like a Cambodian phone number": "លេខនេះមិនមែនជាលេខទូរស័ព្ទកម្ពុជាទេ",
    "Choose a valid Cambodian province / city": "សូមជ្រើសរើសខេត្ត/រាជធានីឱ្យត្រឹមត្រូវ",
    "Image is larger than 8 MB": "រូបភាពធំជាង 8 MB",
    "Unsupported or corrupted image. Use JPG, PNG or WebP.": "រូបភាពមិនគាំទ្រ ឬខូច។ សូមប្រើ JPG, PNG ឬ WebP។",
    "Only JPG, PNG and WebP images are allowed": "អនុញ្ញាតតែរូបភាព JPG, PNG និង WebP ប៉ុណ្ណោះ",
    "Payment already verified": "ការបង់ប្រាក់ត្រូវបានផ្ទៀងផ្ទាត់រួចហើយ",
    "Order is closed": "ការបញ្ជាទិញត្រូវបានបិទ",
    "Only paid orders can be refunded": "អាចសងប្រាក់វិញបានតែការបញ្ជាទិញដែលបានបង់រួច",
    "That name already exists": "ឈ្មោះនេះមានរួចហើយ",
    "That code already exists": "លេខកូដនេះមានរួចហើយ",
    "Sale price must be lower than the regular price": "តម្លៃបញ្ចុះត្រូវតែទាបជាងតម្លៃធម្មតា",
}

PATTERNS: list[tuple[re.Pattern, str]] = [
    (re.compile(r"^(.+) \((.+), EU (.+)\) only has (\d+) left in stock$"), r"\1 (\2, EU \3) នៅសល់តែ \4 គូប៉ុណ្ណោះ"),
    (re.compile(r"^Only (\d+) pair\(s\) left in EU (.+)$"), r"នៅសល់តែ \1 គូ ក្នុងទំហំ EU \2"),
    (re.compile(r"^Only (\d+) pair\(s\) available(.*)$"), r"មានតែ \1 គូប៉ុណ្ណោះ"),
    (re.compile(r"^Maximum (\d+) pairs per item$"), r"អតិបរមា \1 គូក្នុងមួយមុខទំនិញ"),
    (re.compile(r"^Spend at least \$(.+) to use this code$"), r"ទិញយ៉ាងតិច $\1 ដើម្បីប្រើលេខកូដនេះ"),
    (re.compile(r"^Cannot change an order from (\w+) to (\w+)$"), r"មិនអាចប្តូរស្ថានភាពពី \1 ទៅ \2 បានទេ"),
    (re.compile(r"^String should have at least (\d+) characters?$"), r"ត្រូវមានយ៉ាងតិច \1 តួអក្សរ"),
    (re.compile(r"^value is not a valid email address.*$"), "អាសយដ្ឋានអ៊ីមែលមិនត្រឹមត្រូវ"),
    (re.compile(r"^Field required$"), "ចាំបាច់ត្រូវបំពេញ"),
]


def wants_khmer(accept_language: str | None) -> bool:
    return bool(accept_language) and accept_language.lower().startswith("km")


def translate(message: str, accept_language: str | None) -> str:
    if not isinstance(message, str) or not wants_khmer(accept_language):
        return message
    if message in KM:
        return KM[message]
    for rx, repl in PATTERNS:
        if rx.match(message):
            return rx.sub(repl, message)
    return message
