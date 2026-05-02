import { v4 as uuidv4 } from "uuid";

const VISITOR_KEY = "yusen_visitor_id";

export function getVisitorId(): string {
    if (typeof window === "undefined") return "";

    let visitorId = localStorage.getItem(VISITOR_KEY);

    if (!visitorId) {
        visitorId = uuidv4();
        localStorage.setItem(VISITOR_KEY, visitorId);
    }

    return visitorId;
}
