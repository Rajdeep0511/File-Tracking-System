import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useNavigate, useLocation } from 'react-router-dom';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';



function Dashboard({ onLogout, user }) {
  const [activeMenu, setActiveMenu] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [documents, setDocuments] = useState([]);
  const [newDocument, setNewDocument] = useState({
    senderOrg: '',
    applicantName: '',
    orgEmail: user.email || '',
    contactNumber: '',
    receivedOffice: '',
    receiptDate: '',
    purpose: '',
    details: ''
  });
  const [validationErrors, setValidationErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [summaryStats, setSummaryStats] = useState({ total: 0, byStatus: {} });

  const navigate = useNavigate();
  const location = useLocation();
  const API_BASE_URL = 'http://localhost:5000';

  // Menu handling
  const handleMenuClick = (menu) => {
    setActiveMenu(menu);
    setError('');
    setDocuments([]); // Clear previous results when switching menus
    navigate(`?menu=${menu}`, { replace: true });
  };

  // Search functionality
  const handleSearchChange = (e) => setSearchQuery(e.target.value);

  const handleSearchSubmit = useCallback(async (e) => {
    e?.preventDefault();

    // Block empty search query for non-admins
    if (!searchQuery.trim() && user.role !== 'admin' && activeMenu === 'statusTrack') {
      setError('Please enter a search term');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const res = await axios.get(`${API_BASE_URL}/search-documents`, {
        params: {
          query: searchQuery.trim(),
          email: user.email,
          role: user.role
        }
      });

      setDocuments(res.data);

      // Always calculate summary for admin, even with empty search
      if (user.role === 'admin') {
        const byStatus = {};
        res.data.forEach(doc => {
          byStatus[doc.status] = (byStatus[doc.status] || 0) + 1;
        });
        setSummaryStats({ total: res.data.length, byStatus });
      }

    } catch (err) {
      console.error('Search error:', err);
      setError('Failed to search documents. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, user, activeMenu, API_BASE_URL]);

  // Document form handling
  const handleNewDocChange = (e) => {
    const { name, value } = e.target;
    setNewDocument({ ...newDocument, [name]: value });
    if (validationErrors[name]) {
      setValidationErrors({ ...validationErrors, [name]: '' });
    }
  };

  const validateDocument = () => {
    const errors = {};
    const today = new Date().toISOString().split('T')[0];

    const requiredFields = ['senderOrg', 'applicantName', 'orgEmail', 'contactNumber', 'receivedOffice', 'purpose'];
    requiredFields.forEach(field => {
      if (!newDocument[field].trim()) {
        errors[field] = 'This field is required';
      }
    });

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newDocument.orgEmail)) {
      errors.orgEmail = 'Please enter a valid email address';
    }

    if (!/^\d{10}$/.test(newDocument.contactNumber)) {
      errors.contactNumber = 'Contact number must be 10 digits';
    }

    if (newDocument.receiptDate && newDocument.receiptDate > today) {
      errors.receiptDate = 'Receipt date cannot be in the future';
    }

    return errors;
  };

  const handleNewDocSubmit = async (e) => {
    e.preventDefault();
    const errors = validateDocument();
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return;
    }

    setIsLoading(true);
    setError('');
    try {
      const newId = `DOC-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`;


      const docToSubmit = {
        id: newId,
        ...newDocument,
        status: 'Submitted',
        submittedBy: user.email,
        receiptDate: newDocument.receiptDate || new Date().toISOString().split('T')[0]
      };
      console.log("Submitting doc:", docToSubmit);
      console.log("=== USER VALIDATION DEBUG ===");
      console.log("user object:", user);
      console.log("user type:", typeof user);
      console.log("user.email:", user?.email);
      console.log("user.email type:", typeof user?.email);
      console.log("user.email trimmed:", user?.email?.trim());
      console.log("user.email length:", user?.email?.length);
      console.log("================================");

      // ✅ FIX: Corrected API endpoint for creating a new document
      const res = await axios.post(`${API_BASE_URL}/new-document`, docToSubmit);

      if (res.data.success) {
        alert('Document submitted successfully!');
        setNewDocument({
          senderOrg: '',
          applicantName: '',
          orgEmail: user.email || '',
          contactNumber: '',
          receivedOffice: '',
          receiptDate: '',
          purpose: '',
          details: ''
        });
        setValidationErrors({});
      } else {
        throw new Error(res.data.message || 'Submission failed');
      }
    } catch (err) {
      console.error('Submission error:', err);
      setError(err.message || 'Document submission failed');
    } finally {
      setIsLoading(false);
    }
  };

  // Document management
  const handleDocumentUpdate = async (docId, newStatus) => {
    setIsLoading(true);
    try {
      await axios.put(`${API_BASE_URL}/documents/${docId}`, { status: newStatus, role: user.role });

      // ✅ FIX: Update state directly instead of re-fetching
      setDocuments(prevDocs =>
        prevDocs.map(doc =>
          doc.id === docId ? { ...doc, status: newStatus } : doc
        )
      );
      // Also update the summary stats locally for a snappier UI
      setSummaryStats(prevStats => {
        const newByStatus = { ...prevStats.byStatus };
        const oldStatus = documents.find(d => d.id === docId)?.status;
        if (oldStatus) {
          newByStatus[oldStatus] = (newByStatus[oldStatus] || 1) - 1;
        }
        newByStatus[newStatus] = (newByStatus[newStatus] || 0) + 1;
        return { ...prevStats, byStatus: newByStatus };
      });

    } catch (err) {
      console.error('Update error:', err);
      setError('Failed to update document status');
      // OPTIONAL: Could re-fetch here as a fallback if the local update is complex
      // await handleSearchSubmit(); 
    } finally {
      setIsLoading(false);
    }
  };

  const handleDocumentDelete = async (docId) => {
    if (!window.confirm(`Delete document ${docId}?`)) return;
    setIsLoading(true);
    try {
      await axios.delete(`${API_BASE_URL}/documents/${docId}`, { data: { role: user.role } });

      // ✅ FIX: Update state directly instead of re-fetching
      setDocuments(prevDocs => prevDocs.filter(doc => doc.id !== docId));
      // Also update the summary stats locally
      setSummaryStats(prevStats => {
        const deletedDoc = documents.find(d => d.id === docId);
        if (!deletedDoc) return prevStats;

        const newByStatus = { ...prevStats.byStatus };
        newByStatus[deletedDoc.status] = (newByStatus[deletedDoc.status] || 1) - 1;
        if (newByStatus[deletedDoc.status] === 0) {
          delete newByStatus[deletedDoc.status];
        }
        return { total: prevStats.total - 1, byStatus: newByStatus };
      });

    } catch (err) {
      console.error('Delete error:', err);
      alert('Error deleting document.');
    } finally {
      setIsLoading(false);
    }
  };
  // Initialize component based on URL
  // In Dashboard.js

  // A more stable approach to handling side-effects from URL changes
  useEffect(() => {
    const menuParam = new URLSearchParams(location.search).get('menu');

    if (!menuParam) {
      setActiveMenu('welcome');
      return;
    }

    setActiveMenu(menuParam);

    if (menuParam === 'statusTrack') {
      // Automatically fetch all documents for admins when they land on the page
      if (user.role === 'admin') {
        handleSearchSubmit();
      } else if (!searchQuery.trim()) {
        // For non-admins, clear previous results and show a prompt
        setDocuments([]);
        setError('Please enter a search term to track documents.');
      }
    }
    if (menuParam === 'adminDashboard' && user.role === 'admin') {
      handleSearchSubmit(); // Load summary stats
    }


  }, [location.search, user.role]); // Dependency array is now much simpler // Added activeMenu to dependencies

  return (
    <div className="app-container">
      <div className="upper-bar">
        <header className="dashboard-header">
          <div className="user-info">
            <span className="user-icon">👤</span>
            <span className="user-name">{user?.username || 'User'}</span>
          </div>
        </header>
      </div>

    <div className="dashboard-container">
     <div className="sidebar">
    <h2>Menu</h2>

    {user.role === 'admin' && (
      <button
        onClick={() => handleMenuClick('adminDashboard')}
        className={activeMenu === 'adminDashboard' ? 'menu-btn active' : 'menu-btn'}
      >
        Admin Dashboard
      </button>
    )}

    {/* Only show this button if the user is NOT a citizen */}
    {user.role !== 'citizen' && (
      <button
        onClick={() => handleMenuClick('newDoc')}
        className={activeMenu === 'newDoc' ? 'menu-btn active' : 'menu-btn'}
      >
        Enter New Document
      </button>
    )}

    <button
      onClick={() => handleMenuClick('statusTrack')}
      className={activeMenu === 'statusTrack' ? 'menu-btn active' : 'menu-btn'}
    >
      Status Tracking
    </button>

    <button className="logout-btn" onClick={onLogout}>Logout</button>
  </div>

        <div className="content-area">
          {isLoading && <div className="loading">Loading...</div>}
          {error && <div className="error">{error}</div>}

          {activeMenu === 'welcome' && (
            <div className="welcome-message text-center">
              <h2>Welcome to the Document Verification System</h2>
              <p>Please select an option from the menu to get started.</p>
            </div>
          )}

          {activeMenu === 'newDoc' && (
            <form onSubmit={handleNewDocSubmit} className="new-document">
              <h3>Enter New Document</h3>

              <div className="form-group">
                <label>Sender Organization *</label>
                <input
                  name="senderOrg"
                  value={newDocument.senderOrg}
                  onChange={handleNewDocChange}
                  className={validationErrors.senderOrg ? 'error-field' : ''}
                />
                {validationErrors.senderOrg && <span className="error-text">{validationErrors.senderOrg}</span>}
              </div>

              <div className="form-group">
                <label>Applicant Name *</label>
                <input
                  name="applicantName"
                  value={newDocument.applicantName}
                  onChange={handleNewDocChange}
                  className={validationErrors.applicantName ? 'error-field' : ''}
                />
                {validationErrors.applicantName && <span className="error-text">{validationErrors.applicantName}</span>}
              </div>

              <div className="form-group">
                <label>Organization Email *</label>
                <input
                  name="orgEmail"
                  type="email"
                  value={newDocument.orgEmail}
                  onChange={handleNewDocChange}
                  className={validationErrors.orgEmail ? 'error-field' : ''}
                />
                {validationErrors.orgEmail && <span className="error-text">{validationErrors.orgEmail}</span>}
              </div>

              <div className="form-group">
                <label>Contact Number *</label>
                <input
                  name="contactNumber"
                  value={newDocument.contactNumber}
                  onChange={handleNewDocChange}
                  maxLength="10"
                  className={validationErrors.contactNumber ? 'error-field' : ''}
                />
                {validationErrors.contactNumber && <span className="error-text">{validationErrors.contactNumber}</span>}
              </div>

              <div className="form-group">
                <label>Received Office *</label>
                <input
                  name="receivedOffice"
                  value={newDocument.receivedOffice}
                  onChange={handleNewDocChange}
                  className={validationErrors.receivedOffice ? 'error-field' : ''}
                />
                {validationErrors.receivedOffice && <span className="error-text">{validationErrors.receivedOffice}</span>}
              </div>

              <div className="form-group">
                <label>Receipt Date</label>
                <input
                  name="receiptDate"
                  type="date"
                  value={newDocument.receiptDate}
                  onChange={handleNewDocChange}
                  max={new Date().toISOString().split('T')[0]}
                  className={validationErrors.receiptDate ? 'error-field' : ''}
                />
                {validationErrors.receiptDate && <span className="error-text">{validationErrors.receiptDate}</span>}
              </div>

              <div className="form-group">
                <label>Purpose *</label>
                <input
                  name="purpose"
                  value={newDocument.purpose}
                  onChange={handleNewDocChange}
                  className={validationErrors.purpose ? 'error-field' : ''}
                />
                {validationErrors.purpose && <span className="error-text">{validationErrors.purpose}</span>}
              </div>

              <div className="form-group">
                <label>Details</label>
                <textarea
                  name="details"
                  value={newDocument.details}
                  onChange={handleNewDocChange}
                />
              </div>

              <button type="submit" className="submit-btn" disabled={isLoading}>
                {isLoading ? 'Submitting...' : 'Submit Document'}
              </button>
            </form>
          )}

          {activeMenu === 'statusTrack' && (
            <div className="status-tracking">
              <h3>Document Status Tracking</h3>

              <form className="search-container" onSubmit={handleSearchSubmit}>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={handleSearchChange}
                  placeholder="Search by ID, Name, or Email"
                />
                <button type="submit" className="search-btn" disabled={isLoading}>
                  {isLoading ? 'Searching...' : 'Search'}
                </button>
              </form>

              {user.role === 'admin' && documents.length > 0 && (
                <div className="summary">
                  <h4>Total Documents: {summaryStats.total}</h4>
                  <div className="status-counts">
                    {Object.entries(summaryStats.byStatus).map(([status, count]) => (
                      <div key={status} className="status-item">
                        <span className="status-label">{status}:</span>
                        <span className="status-value">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="documents-table">
                <table>
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Sender Organization</th>
                      <th>Applicant</th>
                      <th>Office</th>
                      <th>Status</th>
                      {user.role === 'admin' && <th>Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {documents.length > 0 ? (
                      documents.map(doc => (
                        <tr key={doc.id}>
                          <td>{doc.id}</td>
                          <td>{doc.senderOrg}</td>
                          <td>{doc.applicantName}</td>
                          <td>{doc.receivedOffice}</td>
                          <td>
                            {user.role === 'admin' ? (
                              <select
                                value={doc.status}
                                onChange={(e) => handleDocumentUpdate(doc.id, e.target.value)}
                                disabled={isLoading}
                              >
                                {['Submitted', 'Processing', 'Approved', 'Rejected'].map(status => (
                                  <option key={status} value={status}>{status}</option>
                                ))}
                              </select>
                            ) : (
                              <span className={`status-badge ${doc.status.toLowerCase()}`}>
                                {doc.status}
                              </span>
                            )}
                          </td>
                          {user.role === 'admin' && (
                            <td>
                              <button
                                className="delete-btn"
                                onClick={() => handleDocumentDelete(doc.id)}
                                disabled={isLoading}
                              >
                                Delete
                              </button>
                            </td>
                          )}
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={user.role === 'admin' ? 5 : 4} className="text-center">
                          No documents found. Please enter a search query.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {activeMenu === 'adminDashboard' && user.role === 'admin' && (
            <div className="admin-dashboard">
              <h3>📊 Document Statistics</h3>

              {summaryStats.total === 0 ? (
                <p>No documents found. Use the status tracking page to load stats.</p>
              ) : (
                <div className="dashboard-stats-container">
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={Object.entries(summaryStats.byStatus).map(([status, count]) => ({
                          name: status,
                          value: count
                        }))}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        label
                      >
                        {['#8884d8', '#82ca9d', '#ffc658', '#ff7f7f'].map((color, index) => (
                          <Cell key={`cell-${index}`} fill={color} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>

                  <table className="summary-table">
                    <thead>
                      <tr>
                        <th>Status</th>
                        <th>Count</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(summaryStats.byStatus).map(([status, count]) => (
                        <tr key={status}>
                          <td>{status}</td>
                          <td>{count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      <div className="lower-bar">
        © {new Date().getFullYear()} All rights reserved.
      </div>
    </div >
  );
}


export default function Authentic() {
  const navigate = useNavigate();
  const location = useLocation();

  const [isLogin, setIsLogin] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [formData, setFormData] = useState({
    username: "",
    email: "",
    contact: "", // Will always be present for both user/admin registration
    password: "",
    role: "citizen",
    officeName: "",
    confirmPassword: ""
  });
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [error, setError] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false); // Keep this state name

  const eyeIcon = "👁️";
  const eyeSlashIcon = "🚫";

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });

    if (name === "email") {
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      setEmailError(emailPattern.test(value) ? "" : "Invalid email format.");
    }

    if (name === "contact") {
      const phonePattern = /^[0-9]{10}$/;
      setError(phonePattern.test(value) ? "" : "Contact must be 10 digits.");
    }

    if (name === "confirmPassword" || name === "password") {
      setError(
        name === "confirmPassword" && value !== formData.password
          ? "Passwords do not match."
          : ""
      );
    }
  };

  const handleRoleChange = (e) => {
    setFormData({ ...formData, role: e.target.value });
  };

  const handleEmailChange = (e) => {
    setEmail(e.target.value);
    if (!e.target.value.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      setEmailError("Enter a valid email!");
    } else {
      setEmailError("");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    const { username, email, contact, password, confirmPassword } = formData;

    if (!isLogin) { // Registration validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        setError("Invalid email format");
        return;
      }
      const phoneRegex = /^[0-9]{10}$/;
      // Apply contact validation for both admin and non-admin if contact is required for both
      if (!phoneRegex.test(contact)) { // This validation now applies to admin registration too
        setError("Contact number must be 10 digits.");
        return;
      }
      if (password !== confirmPassword) {
        setError("Passwords do not match");
        return;
      }
      // officeName validation only for organization role and not for admin
      if (formData.role === "organization" && !isAdmin && !formData.officeName) {
        setError("Organization Name is required for the organization role.");
        return;
      }
    }

    try {
      const response = await axios.post(
        isLogin ? `/auth/login` : `/auth/register`,
        isLogin
          ? {
            username,
            password,
            role: isAdmin ? "admin" : formData.role
          }
          : {
            username,
            email,
            contact,
            password,
            confirmPassword,
            role: isAdmin ? "admin" : formData.role,
            ...(formData.role === "organization" && !isAdmin && { officeName: formData.officeName })
          },
        {
          baseURL: "http://localhost:5000",
          headers: { "Content-Type": "application/json" }
        }
      );

      if (isLogin) {
        const loggedInUser = {
          username: response.data.user.username,
          role: response.data.user.role,
          email: response.data.user.email,
        };
        setIsLoggedIn(true);
        setUser(loggedInUser);
        setIsAdmin(loggedInUser.role === "admin");
        sessionStorage.setItem("isLoggedIn", "true");
        sessionStorage.setItem("user", JSON.stringify(loggedInUser));
        navigate(loggedInUser.role === "admin" ? "/admin-dashboard" : "/dashboard", { replace: true });
      } else {
        alert("Registration successful! Please login.");
        setIsLogin(true);
        setFormData({
          username: "", email: "", contact: "", password: "",
          role: "citizen",
          officeName: "", confirmPassword: ""
        });
        setEmailError("");
      }
    } catch (err) {
      console.error("Full error:", err);
      const errorMsg = err.response?.data?.error || err.message || "Server connection failed";
      setError(!err.response ? "Cannot connect to server. Is it running?" : errorMsg);
    }
  };

  const handleForgotPasswordSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!emailError && email) {
      try {
        await axios.post('/auth/forgot-password', { email, role: isAdmin ? "admin" : "user" }, {
          baseURL: "http://localhost:5000",
          headers: { "Content-Type": "application/json" }
        });
        alert("Password reset link sent to your email!");
        setShowForgotPassword(false);
        setEmail("");
      } catch (err) {
        console.error("Forgot password error:", err);
        const errorMsg = err.response?.data?.error || "Failed to send reset link.";
        setError(errorMsg);
      }
    } else {
      setError("Please enter a valid email address.");
    }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setUser(null);
    sessionStorage.removeItem("isLoggedIn");
    sessionStorage.removeItem("user");
    navigate("/", { replace: true });
  };

  useEffect(() => {
    const storedLogin = sessionStorage.getItem("isLoggedIn");
    const storedUser = sessionStorage.getItem("user");

    if (storedLogin === "true" && storedUser) {
      const userData = JSON.parse(storedUser);
      setIsLoggedIn(true);
      setUser(userData);
      setIsAdmin(userData.role === 'admin'); // Set isAdmin based on the stored user's actual role
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Enter') {
        const activeElement = document.activeElement;
        if (activeElement && activeElement.form) {
          const submitButton = activeElement.form.querySelector('button[type="submit"]');
          if (submitButton) {
            submitButton.click();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  if (isLoggedIn) {
    return <Dashboard onLogout={handleLogout} user={user} />;
  }

  return (
    <div className="container">
      <div className="form-container">
        <div className="form-toggle">
          {!showForgotPassword && (
            <>
              <button className={isLogin ? 'active' : ""} onClick={() => {
                setIsLogin(true);
                setError("");
                setEmailError("");
                setFormData({
                  username: "", email: "", contact: "", password: "",
                  role: "citizen",
                  officeName: "", confirmPassword: ""
                });
              }}>Login</button>
              <button className={!isLogin ? 'active' : ""} onClick={() => {
                setIsLogin(false);
                setError("");
                setEmailError("");
                setFormData({
                  username: "", email: "", contact: "", password: "",
                  role: "citizen",
                  officeName: "", confirmPassword: ""
                });
              }}>Register</button>
              <button
                onClick={() => {
                  setIsAdmin(!isAdmin);
                  setError("");
                  setEmailError("");
                  setFormData({
                    username: "", email: "", contact: "", password: "",
                    role: "citizen",
                    officeName: "", confirmPassword: ""
                  });
                  console.log("Switched to", !isAdmin ? "Admin" : "User");
                }}
                style={{
                  backgroundColor: isAdmin ? '#003366' : '#eeeeee',
                  color: isAdmin ? 'white' : '#333',
                  borderRadius: '6px',
                  padding: '4px 8px',
                  marginLeft: '10px',
                  fontWeight: 'bold'
                }}
              >
                {isAdmin ? "Switch to User" : "Switch to Admin"}
              </button>
            </>
          )}
        </div>

        {showForgotPassword ? (
          <form className="form" onSubmit={handleForgotPasswordSubmit}>
            <h2>{isAdmin ? "Admin Password Reset" : "User Password Reset"}</h2>
            <p>Enter your email to receive a password reset link.</p>
            <div className="input-container">
              <span>📧</span>
              <input type="email" placeholder="Email *" required value={email} onChange={handleEmailChange} />
            </div>
            {emailError && <p className="error">{emailError}</p>}
            <button type="submit">Send Reset Link</button>
            <p className="transparent-text">
              <a href="#" onClick={() => { setShowForgotPassword(false); setEmailError(""); setError(""); setEmail(""); }}>Back to Login</a>
            </p>
          </form>
        ) : isLogin ? (
          <form className='form' onSubmit={handleSubmit}>
            <h2>{isAdmin ? "Admin Login" : "User Login"}</h2>
            <p style={{ fontWeight: 'bold', color: isAdmin ? '#b30000' : '#0066cc' }}>
              You are logging in as: {isAdmin ? "Admin" : "User"}
            </p>
            <div className="input-container">
              <span>👤</span>
              <input type="text" name="username" placeholder="Username *" required value={formData.username} onChange={handleChange} />
            </div>
            <div className="input-container">
              <span>🔒</span>
              <input type={showPassword ? "text" : "password"} name="password" placeholder="Password *" required value={formData.password} onChange={handleChange} />
              <button type="button" className="eye-btn" onClick={() => setShowPassword(!showPassword)}>
                {showPassword ? eyeSlashIcon : eyeIcon}
              </button>
            </div>
            <p>
              <a href="#" onClick={() => setShowForgotPassword(true)}>Forgot Password?</a>
            </p>
            <button type="submit">Login</button>
            {error && <p className="error">{error}</p>}
            <p className="transparent-text">
              Not a Member? <a href="#" onClick={() => setIsLogin(false)}>Register now</a>
            </p>
          </form>
        ) : (
          <form className="form" onSubmit={handleSubmit}>
            <h2>{isAdmin ? "Admin Registration" : "User Registration"}</h2>
            <p style={{ fontWeight: 'bold', color: isAdmin ? '#b30000' : '#0066cc' }}>
              You are registering as: {isAdmin ? "Admin" : "User"}
            </p>
            <input type="text" name="username" placeholder="Name *" required value={formData.username} onChange={handleChange} />

            {/* Role selection and officeName only for non-admin registration */}
            {!isAdmin && (
              <>
                <div className="input-container" style={{ display: 'flex', alignItems: 'center', gap: '15px', marginTop: '10px', marginBottom: '10px' }}>
                  <label style={{ fontWeight: 'bold' }}>Role:</label>
                  <input
                    type="radio"
                    id="citizen"
                    name="role"
                    value="citizen"
                    checked={formData.role === "citizen"}
                    onChange={handleRoleChange}
                  />
                  <label htmlFor="citizen">Citizen</label>
                  <input
                    type="radio"
                    id="organization"
                    name="role"
                    value="organization"
                    checked={formData.role === "organization"}
                    onChange={handleRoleChange}
                  />
                  <label htmlFor="organization">Organization</label>
                </div>
                {/* Show officeName only if role is 'organization' */}
                {formData.role === "organization" && (
                  <input type="text" name="officeName" placeholder="Organization Name *" required value={formData.officeName} onChange={handleChange} />
                )}
              </>
            )}

            <div className="input-container">
              <span>📧</span>
              <input type="email" name="email" placeholder="Email *" required value={formData.email} onChange={handleChange} />
            </div>

            {/* Contact No. field is ALWAYS shown for registration as per your schema */}
            <div className="input-container">
              <span>📞</span>
              <input type="text" name="contact" placeholder="Contact No. *" required value={formData.contact} onChange={handleChange} />
            </div>

            <div className="input-container">
              <span>🔒</span>
              <input type={showPassword ? "text" : "password"} name="password" placeholder="Password *" required value={formData.password} onChange={handleChange} />
              <button type="button" className="eye-btn" onClick={() => setShowPassword(!showPassword)}>
                {showPassword ? eyeSlashIcon : eyeIcon}
              </button>
            </div>
            <div className="input-container">
              <span>🔒</span>
              <input type={showPassword ? "text" : "password"} name="confirmPassword" placeholder="Confirm Password *" required value={formData.confirmPassword} onChange={handleChange} />
            </div>
            <button type="submit">Register</button>
            {error && <p className="error">{error}</p>}
          </form>
        )}
      </div>
      <div className="lower-bar">
        © {new Date().getFullYear()} All rights reserved.
      </div>
    </div>
  );
}