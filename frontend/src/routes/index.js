import React, { useEffect, useState, Suspense } from "react";
import { BrowserRouter, Switch } from "react-router-dom";
import { ToastContainer } from "react-toastify";
import CircularProgress from "@mui/material/CircularProgress";

import LoggedInLayout from "../layout";
import Login from "../pages/Login";
import Signup from "../pages/Signup";
import { AuthProvider } from "../context/Auth/AuthContext";
import { TicketsContextProvider } from "../context/Tickets/TicketsContext";
import { WhatsAppsProvider } from "../context/WhatsApp/WhatsAppsContext";
import Route from "./Route";

const Dashboard = React.lazy(() => import("../pages/Dashboard"));
const TicketResponsiveContainer = React.lazy(() => import("../pages/TicketResponsiveContainer"));
const Connections = React.lazy(() => import("../pages/Connections"));
const SettingsCustom = React.lazy(() => import("../pages/SettingsCustom"));
const Financeiro = React.lazy(() => import("../pages/Financeiro"));
const Users = React.lazy(() => import("../pages/Users"));
const Contacts = React.lazy(() => import("../pages/Contacts"));
const ContactImportPage = React.lazy(() => import("../pages/Contacts/import"));
const ChatMoments = React.lazy(() => import("../pages/Moments"));
const Queues = React.lazy(() => import("../pages/Queues"));
const Tags = React.lazy(() => import("../pages/Tags"));
const MessagesAPI = React.lazy(() => import("../pages/MessagesAPI"));
const Helps = React.lazy(() => import("../pages/Helps"));
const ContactLists = React.lazy(() => import("../pages/ContactLists"));
const ContactListItems = React.lazy(() => import("../pages/ContactListItems"));
const Companies = React.lazy(() => import("../pages/Companies"));
const QuickMessages = React.lazy(() => import("../pages/QuickMessages"));
const Schedules = React.lazy(() => import("../pages/Schedules"));
const Campaigns = React.lazy(() => import("../pages/Campaigns"));
const CampaignsConfig = React.lazy(() => import("../pages/CampaignsConfig"));
const CampaignReport = React.lazy(() => import("../pages/CampaignReport"));
const Annoucements = React.lazy(() => import("../pages/Annoucements"));
const Chat = React.lazy(() => import("../pages/Chat"));
const Prompts = React.lazy(() => import("../pages/Prompts"));
const AllConnections = React.lazy(() => import("../pages/AllConnections"));
const ReportsLazy = React.lazy(() => import("../pages/Reports"));
const QueueIntegration = React.lazy(() => import("../pages/QueueIntegration"));
const Files = React.lazy(() => import("../pages/Files"));
const ToDoList = React.lazy(() => import("../pages/ToDoList"));
const Kanban = React.lazy(() => import("../pages/Kanban"));
const TagsKanban = React.lazy(() => import("../pages/TagsKanban"));
const ForgotPassword = React.lazy(() => import("../pages/ForgetPassWord"));
const ResetPassword = React.lazy(() => import("../pages/ResetPassword"));
const FlowBuilder = React.lazy(() => import("../pages/FlowBuilder"));
const FlowDefault = React.lazy(() => import("../pages/FlowDefault"));
const FlowBuilderConfig = React.lazy(() => import("../pages/FlowBuilderConfig"));
const CampaignsPhrase = React.lazy(() => import("../pages/CampaignsPhrase"));
const Subscription = React.lazy(() => import("../pages/Subscription"));

const Routes = () => {
  const [showCampaigns, setShowCampaigns] = useState(false);

  useEffect(() => {
    const cshow = localStorage.getItem("cshow");
    if (cshow !== undefined) {
      setShowCampaigns(true);
    }
  }, []);

  return (
    <BrowserRouter>
      <AuthProvider>
        <TicketsContextProvider>
          <Switch>
            <Route exact path="/login" component={Login} />
            <Route exact path="/signup" component={Signup} />
            <Route exact path="/forgot-password" component={ForgotPassword} />
            <Route exact path="/reset-password" component={ResetPassword} />
            <WhatsAppsProvider>
              <LoggedInLayout>
                <Suspense fallback={<CircularProgress/>}>
                  <Route exact path="/financeiro" component={Financeiro} isPrivate />
                </Suspense>
                <Suspense fallback={<CircularProgress/>}>
                  <Route exact path="/companies" component={Companies} isPrivate />
                </Suspense>
                <Suspense fallback={<CircularProgress/>}>
                  <Route exact path="/" component={Dashboard} isPrivate />
                </Suspense>
                <Suspense fallback={<CircularProgress/>}>
                  <Route exact path="/tickets/:ticketId?" component={TicketResponsiveContainer} isPrivate />
                </Suspense>
                <Suspense fallback={<CircularProgress/>}>
                  <Route exact path="/connections" component={Connections} isPrivate />
                </Suspense>
                <Suspense fallback={<CircularProgress/>}>
                  <Route exact path="/quick-messages" component={QuickMessages} isPrivate />
                </Suspense>
                <Suspense fallback={<CircularProgress/>}>
                  <Route exact path="/todolist" component={ToDoList} isPrivate />
                </Suspense>
                <Suspense fallback={<CircularProgress/>}>
                  <Route exact path="/schedules" component={Schedules} isPrivate />
                </Suspense>
                <Suspense fallback={<CircularProgress/>}>
                  <Route exact path="/tags" component={Tags} isPrivate />
                </Suspense>
                <Suspense fallback={<CircularProgress/>}>
                  <Route exact path="/contacts" component={Contacts} isPrivate />
                </Suspense>
                <Suspense fallback={<CircularProgress/>}>
                  <Route exact path="/contacts/import" component={ContactImportPage} isPrivate />
                </Suspense>
                <Suspense fallback={<CircularProgress/>}>
                  <Route exact path="/helps" component={Helps} isPrivate />
                </Suspense>
                <Suspense fallback={<CircularProgress/>}>
                  <Route exact path="/users" component={Users} isPrivate />
                </Suspense>
                <Suspense fallback={<CircularProgress/>}>
                  <Route exact path="/messages-api" component={MessagesAPI} isPrivate />
                </Suspense>
                <Suspense fallback={<CircularProgress/>}>
                  <Route exact path="/settings" component={SettingsCustom} isPrivate />
                </Suspense>
                <Suspense fallback={<CircularProgress/>}>
                  <Route exact path="/queues" component={Queues} isPrivate />
                </Suspense>
                <Suspense fallback={<CircularProgress/>}>
                  <Route exact path="/reports" component={ReportsLazy} isPrivate />
                </Suspense>
                <Suspense fallback={<CircularProgress/>}>
                  <Route exact path="/queue-integration" component={QueueIntegration} isPrivate />
                </Suspense>
                <Suspense fallback={<CircularProgress/>}>
                  <Route exact path="/announcements" component={Annoucements} isPrivate />
                </Suspense>
                <Suspense fallback={<CircularProgress/>}>
                  <Route
                    exact
                    path="/phrase-lists"
                    component={CampaignsPhrase}
                    isPrivate
                  />
                </Suspense>
                <Suspense fallback={<CircularProgress/>}>
                  <Route
                    exact
                    path="/flowbuilders"
                    component={FlowBuilder}
                    isPrivate
                  />
                </Suspense>
                <Suspense fallback={<CircularProgress/>}>
                  <Route
                    exact
                    path="/flowbuilder/:id?"
                    component={FlowBuilderConfig}
                    isPrivate
                  />
                </Suspense>
                <Suspense fallback={<CircularProgress/>}>
                  <Route exact path="/chats/:id?" component={Chat} isPrivate />
                </Suspense>
                <Suspense fallback={<CircularProgress/>}>
                  <Route exact path="/files" component={Files} isPrivate />
                </Suspense>
                <Suspense fallback={<CircularProgress/>}>
                  <Route exact path="/moments" component={ChatMoments} isPrivate />
                </Suspense>
                <Suspense fallback={<CircularProgress/>}>
                  <Route exact path="/Kanban" component={Kanban} isPrivate />
                </Suspense>
                <Suspense fallback={<CircularProgress/>}>
                  <Route exact path="/TagsKanban" component={TagsKanban} isPrivate />
                </Suspense>
                <Suspense fallback={<CircularProgress/>}>
                  <Route exact path="/prompts" component={Prompts} isPrivate />
                </Suspense>
                <Suspense fallback={<CircularProgress/>}>
                  <Route exact path="/allConnections" component={AllConnections} isPrivate />
                </Suspense>
                {showCampaigns && (
                  <>
                    <Suspense fallback={<CircularProgress/>}>
                      <Route exact path="/contact-lists" component={ContactLists} isPrivate />
                    </Suspense>
                    <Suspense fallback={<CircularProgress/>}>
                      <Route exact path="/contact-lists/:contactListId/contacts" component={ContactListItems} isPrivate />
                    </Suspense>
                    <Suspense fallback={<CircularProgress/>}>
                      <Route exact path="/campaigns" component={Campaigns} isPrivate />
                    </Suspense>
                    <Suspense fallback={<CircularProgress/>}>
                      <Route exact path="/campaign/:campaignId/report" component={CampaignReport} isPrivate />
                    </Suspense>
                    <Suspense fallback={<CircularProgress/>}>
                      <Route exact path="/campaigns-config" component={CampaignsConfig} isPrivate />
                    </Suspense>
                  </>
                )}
              </LoggedInLayout>
            </WhatsAppsProvider>
          </Switch>
          <ToastContainer position="top-center" autoClose={3000} />
        </TicketsContextProvider>
      </AuthProvider>
    </BrowserRouter>
  );
};

export default Routes;
