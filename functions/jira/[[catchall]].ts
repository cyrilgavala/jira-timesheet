
interface Env {
    JIRA_BASE_URL: string;
    JIRA_EMAIL: string;
    JIRA_API_TOKEN: string;
}

const APP_HEADER = "x-timesheet";

function basicAuth(email: string, token: string): string {
    return `Basic ${btoa(`${email}:${token}`)}`;
}

export const onRequest: PagesFunction<Env> = async ({
    request,
    env,
}) => {
    const url = new URL(request.url);
    const baseUrl = env.JIRA_BASE_URL?.replace(/\/+$/, "");

    // Configuration endpoint for frontend links.
    if (url.pathname === "/jira/config") {
        if (!baseUrl) {
            return Response.json(
                { errorMessages: ["JIRA_BASE_URL is not configured"] },
                { status: 500 },
            );
        }

        return Response.json({ baseUrl });
    }

    if (!baseUrl || !env.JIRA_EMAIL || !env.JIRA_API_TOKEN) {
        return Response.json(
            { errorMessages: ["Jira environment variables are not configured"] },
            { status: 500 },
        );
    }

    // Remove /jira prefix.
    const jiraPath = url.pathname.replace(/^\/jira(?=\/|$)/, "");
    const jiraUrl = `${baseUrl}${jiraPath}${url.search}`;

    const headers = new Headers(request.headers);

    headers.delete("origin");
    headers.delete("referer");
    headers.delete("host");
    headers.delete("authorization");

    headers.set("User-Agent", "jira-timesheet");
    headers.set(APP_HEADER, "1");
    headers.set(
        "Authorization",
        basicAuth(env.JIRA_EMAIL, env.JIRA_API_TOKEN),
    );

    const response = await fetch(jiraUrl, {
        method: request.method,
        headers,
        body:
            request.method === "GET" || request.method === "HEAD"
                ? undefined
                : request.body,
        redirect: "manual",
    });

    // Avoid forwarding hop-by-hop and potentially misleading headers.
    const responseHeaders = new Headers(response.headers);
    responseHeaders.delete("connection");
    responseHeaders.delete("transfer-encoding");
    responseHeaders.delete("content-encoding");

    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
    });
};
