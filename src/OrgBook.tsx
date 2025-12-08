import React, { useState, useEffect, useMemo } from 'react';
import { Search, Users, Building2, Tag, Upload, X, ExternalLink, Plus, Edit2, Trash } from 'lucide-react';
import * as XLSX from 'xlsx';

const safeLoad = (key) => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error(`Corrupted localStorage key: ${key}`, e);
    return [];
  }
};

const capitalize = (s) =>
    s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : "";

const normalizeName = (name) => {
  if (!name) return "";

  let n = name.trim().toLowerCase();

  // Handle "last, first" → "first last"
  if (n.includes(",")) {
    const [last, first] = n.split(",").map(s => s.trim());
    return `${first} ${last}`;
  }

  return n;
};

const OrgCommTool = () => {
  const [employees, setEmployees] = useState(() => safeLoad("employees"));
  useEffect(() => {
    try {
      localStorage.setItem("employees", JSON.stringify(employees));
    } catch (e) {
      console.error("Failed to save employees", e);
    }
  }, [employees]);
  
  const [topics, setTopics] = useState(() => safeLoad("topics"));
  useEffect(() => {
    try {
      localStorage.setItem("topics", JSON.stringify(topics));
    } catch (e) {
      console.error("Failed to save topics", e);
    }
  }, [topics]);
  
  const [teams, setTeams] = useState(() => safeLoad("teams"));
  useEffect(() => {
    try {
      localStorage.setItem("teams", JSON.stringify(teams));
    } catch (e) {
      console.error("Failed to save teams", e);
    }
  }, [teams]);
  
  const [activeView, setActiveView] = useState('employees');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDepartment, setFilterDepartment] = useState('');
  const [filterManager, setFilterManager] = useState('');
  const [filterTopic, setFilterTopic] = useState('');
  const [filterTeam, setFilterTeam] = useState('');
  const [selectedItem, setSelectedItem] = useState(null);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [createType, setCreateType] = useState('');
  const [formData, setFormData] = useState({});
  const [mergeEmployee, setMergeEmployee] = useState(null);

  // Deleting functionality
  const deleteDepartment = (departmentName) => {
    // get all employees in this department
    const employeesToDelete = employees.filter(e => e.department === departmentName).map(e => e.id);
  
    // 1. Remove all employees in this department
    setEmployees(prev =>
      prev.filter(e => e.department !== departmentName)
    );
  
    // 2. Remove these employees from all topics
    setTopics(prev =>
      prev.map(topic => ({
        ...topic,
        employees: topic.experts.filter(id => !employeesToDelete.includes(id))
      }))
    );
  
    // 3. Remove these employees from all teams
    setTeams(prev =>
      prev.map(team => ({
        ...team,
        employees: team.employees.filter(id => !employeesToDelete.includes(id))
      }))
    );
  };
  
  const deleteEmployee = (employeeId) => {
    // 1. Remove employee record
    setEmployees(prev => prev.filter(e => e.id !== employeeId));
  
    // 2. Remove employee from all topics
    setTopics(prev =>
      prev.map(t => ({
        ...t,
        employees: t.employees.filter(id => id !== employeeId)
      }))
    );
  
    // 3. Remove employee from all teams
    setTeams(prev =>
      prev.map(team => ({
        ...team,
        employees: team.employees.filter(id => id !== employeeId)
      }))
    );
  
    // Close modal
    setSelectedItem(null);
  };

  const mergeEmployees = (sourceId, targetId) => {
    const source = employees.find(e => e.id === sourceId);
    const target = employees.find(e => e.id === targetId);
  
    if (!source || !target) return;
  
    // Merge arrays uniquely
    const mergeUnique = (a,b) => [...new Set([...(a || []), ...(b || [])])];
  
    const merged = {
      ...target,
      jobTitle: target.jobTitle || source.jobTitle,
      department: target.department || source.department,
      reportsTo: target.reportsTo || source.reportsTo,
      teams: mergeUnique(target.teams, source.teams),
      topics: mergeUnique(target.topics, source.topics),
    };
  
    // Update all team references
    const updatedTeams = teams.map(t => ({
      ...t,
      employees: t.employees?.map(id => id === sourceId ? targetId : id)
    }));
  
    // Update topics
    const updatedTopics = topics.map(t => ({
      ...t,
      experts: t.experts?.map(id => id === sourceId ? targetId : id)
    }));
  
    // Update employees list (delete source, replace target)
    const updatedEmployees = employees
      .filter(e => e.id !== sourceId)
      .map(e => (e.id === targetId ? merged : e));
  
    setEmployees(updatedEmployees);
    setTeams(updatedTeams);
    setTopics(updatedTopics);
  
    setMergeEmployee(null);
    setSelectedItem(null);
  };

  const deleteTopic = (topicId) => {
    // Remove topic from topic list
    setTopics(prev => prev.filter(t => t.id !== topicId));
  
    // Remove topic link from every employee
    setEmployees(prev =>
      prev.map(emp => ({
        ...emp,
        topics: emp.topics.filter(id => id !== topicId)
      }))
    );
  
    setSelectedItem(null);
  };

  const deleteTeam = (teamId) => {
    // Remove team
    setTeams(prev => prev.filter(t => t.id !== teamId));
  
    // Remove team link from employees
    setEmployees(prev =>
      prev.map(emp => ({
        ...emp,
        teams: emp.teams.filter(id => id !== teamId)
      }))
    );
  
    setSelectedItem(null);
  };

  // File import handlers
  const handleEmployeeSkillImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
  
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  
    let newEmployees = [...employees];
    let newTopics = [...topics];
  
    const getEmp = (name) =>
      newEmployees.find((e) => normalizeName(e.name) === normalizeName(name));
  
    const getTopic = (skill) =>
      newTopics.find((t) => t.name.toLowerCase() === skill.toLowerCase());
  
    for (const row of rows) {
      const rawName = row["name"] || row["Name"] || "";
      const rawSkill = row["skill"] || row["Skill"] || "";
  
      if (!rawName.trim() || !rawSkill.trim()) continue;
  
      // ------------------------
      // EMPLOYEE: Find or Create
      // ------------------------
      let emp = getEmp(rawName);
  
      if (!emp) {
        emp = {
          id: `emp-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          name: rawName.trim(),
          reportsTo: "",
          jobTitle: "",
          department: "Unassigned",
          topics: [],
          teams: []
        };
        newEmployees.push(emp);
      }
  
      // ------------------------
      // TOPIC (skill): Find or Create
      // ------------------------
      let topic = getTopic(rawSkill);
  
      if (!topic) {
        topic = {
          id: `topic-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          name: rawSkill.trim(),
          description: `Skill: ${rawSkill.trim()}`,
          experts: [],
          employees: [],
          link: "",
          teams: []
        };
        newTopics.push(topic);
      }
  
      // ------------------------
      // Attach employee to topic
      // ------------------------
      if (!topic.experts.includes(emp.id)) {
        topic.experts = [...topic.experts, emp.id];
      }
  
      // ------------------------
      // Attach topic to employee
      // ------------------------
      if (!emp.topics.includes(topic.id)) {
        emp.topics = [...emp.topics, topic.id];
      }
    }
  
    // Save updated structures
    setEmployees(newEmployees);
    setTopics(newTopics);
  
    // Clear file input
    e.target.value = "";
  };
  
  const handleProductComponentsImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
  
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  
    let newTopics = [];
    let updatedEmployees = [...employees];
  
    // For fast lookup
    const findEmpByName = (name) =>
      updatedEmployees.find((e) =>
        normalizeName(e.name) === normalizeName(name)
      );
  
    rows.forEach((row) => {
      const topicName = row["component"] || row["Component"] || "";
      if (!topicName.trim()) return;
  
      const description =
        row["description"] ||
        row["Description"] ||
        "";
  
      const pmName =
        row["product manager"] ||
        row["Product Manager"] ||
        "";
  
      const poName =
        row["product owner"] ||
        row["Product Owner"] ||
        "";
  
      const scName =
        row["support coach"] ||
        row["Support Coach"] ||
        "";
  
      // Build list of employee IDs
      let expertIds = [];
  
      const ensureEmployee = (name) => {
        if (!name.trim()) return;
  
        let emp = findEmpByName(name);
  
        if (!emp) {
          // Create new employee if none found
          emp = {
            id: `emp-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            name: name,
            reportsTo: "",
            jobTitle: "",
            department: "Unassigned",
            topics: [],
            teams: []
          };
          updatedEmployees.push(emp);
        }
  
        expertIds.push(emp.id);
  
        // Attach topic AFTER topic creation (done later)
        return emp;
      };
  
      ensureEmployee(pmName);
      ensureEmployee(poName);
      ensureEmployee(scName);
  
      const topicId = `topic-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  
      newTopics.push({
        id: topicId,
        name: topicName.trim(),
        description: description.trim(),
        experts: expertIds,
        employees: [], // unused now, but keep structure consistent
        link: "",
        teams: []
      });
    });
  
    // Save topics
    setTopics((prev) => [...prev, ...newTopics]);
  
    // Update employee → topics linkage
    updatedEmployees = updatedEmployees.map((emp) => {
      const adds = [];
      newTopics.forEach((t) => {
        if (t.experts.includes(emp.id)) {
          adds.push(t.id);
        }
      });
  
      return {
        ...emp,
        topics: [...new Set([...(emp.topics || []), ...adds])]
      };
    });
  
    setEmployees(updatedEmployees);
  
    // Reset file input
    e.target.value = "";
  };
  
  const handleCodeOwnersImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
  
    const text = await file.text();
    const json = JSON.parse(text);
  
    const groups = json.groups || {};
  
    // Prepare new arrays
    let newTeams = [];
    let newEmployees = [...employees]; // start with existing
    let teamLinks = {}; // teamId -> list of employeeIds to link
  
    Object.entries(groups).forEach(([groupName, members]) => {
      const teamId = `team-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  
      newTeams.push({
        id: teamId,
        name: groupName,
        description: "Imported from CODEOWNERS JSON",
        teamsLink: "",
        employees: []
      });
  
      teamLinks[teamId] = [];
  
      members.forEach(handle => {
        const clean = handle.replace("@", "").trim();
        const [first, last] = clean.split(".");
        const fullName = `${capitalize(first)} ${capitalize(last)}`;
      
        // MATCH EXISTING EMPLOYEES REGARDLESS OF NAME FORMAT
        const normalizedFull = normalizeName(fullName);
      
        let emp = newEmployees.find(e =>
          normalizeName(e.name) === normalizedFull
        );
      
        if (!emp) {
          emp = {
            id: `emp-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            name: fullName,
            reportsTo: "",
            jobTitle: "",
            department: "Unassigned",
            topics: [],
            teams: [teamId]
          };
          newEmployees.push(emp);
        } else {
          if (!emp.teams.includes(teamId)) {
            emp.teams = [...emp.teams, teamId];
          }
        }
      
        teamLinks[teamId].push(emp.id);
      });
    });
  
    // Merge into state ONCE
    setTeams(prev =>
      [
        ...prev,
        ...newTeams.map(t => ({
          ...t,
          employees: teamLinks[t.id]
        }))
      ]
    );
  
    setEmployees(newEmployees);
  
    e.target.value = "";
  };
  
  const handleEmployeeImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const data = new Uint8Array(evt.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(sheet);
      
      const employeeData = jsonData.map((row, idx) => ({
        id: `emp-${idx}`,
        name: row.Name || row.name || '',
        reportsTo: row['Reports To'] || row.reportsTo || row['reports to'] || '',
        jobTitle: row['Job Title'] || row.jobTitle || row['job title'] || '',
        department: row.Department || row.department || "Unassigned",
        topics: [],
        teams: []
      }));
      
      setEmployees(prev => [
        ...prev,
        ...employeeData.map(emp => ({
          ...emp,
          id: `emp-${Date.now()}-${Math.random().toString(36).slice(2)}` // ensure unique IDs
        }))
      ]);
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const handleTopicImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const data = new Uint8Array(evt.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(sheet);
      
      const topicData = jsonData.map((row, idx) => ({
        id: `topic-${idx}`,
        name: row.Name || row.name || '',
        description: row.Description || row.description || '',
        employees: []
      }));
      
      setTopics(prev => [
        ...prev,
        ...topicData.map(topic => ({
          ...topic,
          id: `topic-${Date.now()}-${Math.random().toString(36).slice(2)}`
        }))
      ]);
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const handleTeamImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const data = new Uint8Array(evt.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(sheet);
      
      const teamData = jsonData.map((row, idx) => ({
        id: `team-${idx}`,
        name: row.Name || row.name || '',
        description: row.Description || row.description || '',
        teamsLink: row['Teams Channel'] || row.teamsLink || row['teams channel'] || '',
        employees: []
      }));
      
      setTeams(prev => [
        ...prev,
        ...teamData.map(team => ({
          ...team,
          id: `team-${Date.now()}-${Math.random().toString(36).slice(2)}`
        }))
      ]);
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  // Linking functionality
  const linkEmployeeToItem = (employeeId, itemId, itemType) => {
    setEmployees(prev => prev.map(emp => {
      if (emp.id === employeeId) {
        const array = itemType === 'topic' ? 'topics' : 'teams';
        return { ...emp, [array]: [...emp[array], itemId] };
      }
      return emp;
    }));

    if (itemType === 'topic') {
      setTopics(prev => prev.map(topic => {
        if (topic.id === itemId) {
          return { ...topic, employees: [...topic.experts, employeeId] };
        }
        return topic;
      }));
    } else {
      setTeams(prev => prev.map(team => {
        if (team.id === itemId) {
          return { ...team, employees: [...team.employees, employeeId] };
        }
        return team;
      }));
    }
  };

  const unlinkEmployeeFromItem = (employeeId, itemId, itemType) => {
    setEmployees(prev => prev.map(emp => {
      if (emp.id === employeeId) {
        const array = itemType === 'topic' ? 'topics' : 'teams';
        return { ...emp, [array]: emp[array].filter(id => id !== itemId) };
      }
      return emp;
    }));

    if (itemType === 'topic') {
      setTopics(prev => prev.map(topic => {
        if (topic.id === itemId) {
          return { ...topic, employees: topic.experts.filter(id => id !== employeeId) };
        }
        return topic;
      }));
    } else {
      setTeams(prev => prev.map(team => {
        if (team.id === itemId) {
          return { ...team, employees: team.employees.filter(id => id !== employeeId) };
        }
        return team;
      }));
    }
  };

  // Organize employees by manager and department
  const organizedEmployees = useMemo(() => {
    const depts = {};
    
    employees.forEach(emp => {
      if (!depts[emp.department]) {
        depts[emp.department] = {};
      }
      if (!depts[emp.department][emp.reportsTo]) {
        depts[emp.department][emp.reportsTo] = [];
      }
      depts[emp.department][emp.reportsTo].push(emp);
    });
    
    return depts;
  }, [employees]);

  // Filter employees
  const filteredEmployees = useMemo(() => {
    return employees.filter(emp => {
      const matchesSearch = normalizeName(emp.name).includes(normalizeName(searchTerm));
      const matchesDept = !filterDepartment || emp.department === filterDepartment;
      const matchesManager = !filterManager || emp.reportsTo === filterManager;
      const matchesTopic = !filterTopic || emp.topics.includes(filterTopic);
      const matchesTeam = !filterTeam || emp.teams.includes(filterTeam);
      
      return matchesSearch && matchesDept && matchesManager && matchesTopic && matchesTeam;
    });
  }, [employees, searchTerm, filterDepartment, filterManager, filterTopic, filterTeam]);

  const departments = [...new Set(employees.map(e => e.department))].filter(Boolean);
  const managers = [...new Set(employees.map(e => e.reportsTo))].filter(Boolean);

  // Create new items
  const openCreateModal = (type) => {
    setCreateType(type);
    setFormData({});
    setShowCreateModal(true);
  };

  const handleCreate = () => {
    if (createType === 'employee') {
      const newEmployee = {
        id: `emp-${Date.now()}`,
        name: formData.name || '',
        reportsTo: formData.reportsTo || '',
        jobTitle: formData.jobTitle || '',
        department: formData.department || "Unassigned",
        topics: [],
        teams: []
      };
      setEmployees([...employees, newEmployee]);
    } else if (createType === 'topic') {
      const newTopic = {
        id: `topic-${Date.now()}`,
        name: formData.name || '',
        description: formData.description || '',
        employees: []
      };
      setTopics([...topics, newTopic]);
    } else if (createType === 'team') {
      const newTeam = {
        id: `team-${Date.now()}`,
        name: formData.name || '',
        description: formData.description || '',
        teamsLink: formData.teamsLink || '',
        employees: []
      };
      setTeams([...teams, newTeam]);
    }
    setShowCreateModal(false);
    setFormData({});
  };

  // Edit items
  const openEditModal = (item, type) => {
    setCreateType(type);
    setFormData({...item});
    setShowEditModal(true);
  };

  const handleEdit = () => {
    if (createType === 'employee') {
      setEmployees(prev => prev.map(emp => 
        emp.id === formData.id ? {
          ...emp,
          name: formData.name || '',
          reportsTo: formData.reportsTo || '',
          jobTitle: formData.jobTitle || '',
          department: formData.department || "Unassigned"
        } : emp
      ));
      if (selectedItem?.data?.id === formData.id) {
        setSelectedItem({
          type: 'employee',
          data: { ...selectedItem.data, ...formData }
        });
      }
    } else if (createType === 'topic') {
      setTopics(prev => prev.map(topic => 
        topic.id === formData.id ? {
          ...topic,
          name: formData.name || '',
          description: formData.description || ''
        } : topic
      ));
      if (selectedItem?.data?.id === formData.id) {
        setSelectedItem({
          type: 'topic',
          data: { ...selectedItem.data, ...formData }
        });
      }
    } else if (createType === 'team') {
      setTeams(prev => prev.map(team => 
        team.id === formData.id ? {
          ...team,
          name: formData.name || '',
          description: formData.description || '',
          teamsLink: formData.teamsLink || ''
        } : team
      ));
      if (selectedItem?.data?.id === formData.id) {
        setSelectedItem({
          type: 'team',
          data: { ...selectedItem.data, ...formData }
        });
      }
    }
    setShowEditModal(false);
    setFormData({});
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold text-slate-800">OrgBook</h1>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex gap-1">
            {[
              { id: 'employees', label: 'Employees', icon: Users },
              { id: 'topics', label: 'Topics', icon: Tag },
              { id: 'teams', label: 'Tech Teams', icon: Building2 }
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveView(id)}
                className={`px-6 py-3 font-medium transition-colors flex items-center gap-2 border-b-2 ${
                  activeView === id
                    ? 'text-blue-600 border-blue-600'
                    : 'text-slate-600 border-transparent hover:text-slate-900'
                }`}
              >
                <Icon size={18} />
                {label}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Create Button */}
        <div className="mb-6 flex justify-end gap-2">

          {/* CREATE button */}
          <button
            onClick={() => openCreateModal(
              activeView === 'employees' ? 'employee' :
              activeView === 'topics' ? 'topic' : 'team'
            )}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center gap-2 shadow-sm"
          >
            <Plus size={20} />
            Create New {activeView === 'employees' ? 'Employee' : activeView === 'topics' ? 'Topic' : 'Tech Team'}
          </button>
        
          {/* IMPORT button for THIS view */}
          {activeView === 'employees' && (
            <label className="px-6 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 cursor-pointer transition-colors font-medium flex items-center gap-2 shadow-sm">
              <Upload size={20} />
              Import Employees
              <input type="file" accept=".xlsx,.xls" onChange={handleEmployeeImport} className="hidden" />
            </label>
          )}
          {activeView === 'topics' && (
            <label className="px-6 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 cursor-pointer transition-colors font-medium flex items-center gap-2 shadow-sm">
              <Upload size={20} />
              Import Topics
              <input type="file" accept=".xlsx,.xls" onChange={handleTopicImport} className="hidden" />
            </label>
          )}
          {activeView === 'teams' && (
            <label className="px-6 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 cursor-pointer transition-colors font-medium flex items-center gap-2 shadow-sm">
              <Upload size={20} />
              Import Teams
              <input type="file" accept=".xlsx,.xls" onChange={handleTeamImport} className="hidden" />
            </label>
          )}

          {activeView === 'teams' && (
            <label className="px-6 py-3 bg-amber-600 text-white rounded-lg hover:bg-amber-700 cursor-pointer transition-colors font-medium flex items-center gap-2 shadow-sm">
              <Upload size={20} />
              Import Code Owners (JSON)
              <input
                type="file"
                accept="application/json"
                onChange={handleCodeOwnersImport}
                className="hidden"
              />
            </label>
          )}

          {activeView === 'topics' && (
            <label className="flex items-center gap-2 cursor-pointer px-3 py-2 rounded-lg bg-blue-600 text-white">
              <Upload size={16} />
              Import Product Components (xlsx)
              <input
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={handleProductComponentsImport}
              />
            </label>
          )}

          {activeView === 'employees' && (
            <label className="flex items-center gap-2 cursor-pointer px-3 py-2 rounded-lg bg-blue-600 text-white">
              <Upload size={16} />
              Import Employee Skills
              <input
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={handleEmployeeSkillImport}
              />
            </label>
          )}
        
        </div>

        {/* Search and Filters */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="md:col-span-2 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="text"
                placeholder="Search by name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <select
              value={filterDepartment}
              onChange={(e) => setFilterDepartment(e.target.value)}
              className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">All Departments</option>
              {departments.map(dept => <option key={dept} value={dept}>{dept}</option>)}
            </select>
            <select
              value={filterTopic}
              onChange={(e) => setFilterTopic(e.target.value)}
              className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">All Topics</option>
              {topics.map(topic => <option key={topic.id} value={topic.id}>{topic.name}</option>)}
            </select>
            <select
              value={filterTeam}
              onChange={(e) => setFilterTeam(e.target.value)}
              className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">All Teams</option>
              {teams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}
            </select>
          </div>
        </div>

        {/* Employees View */}
        {activeView === 'employees' && (
          <div className="space-y-6">
            {Object.entries(organizedEmployees).map(([dept, managerGroups]) => (
              <div key={dept} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="bg-gradient-to-r from-slate-700 to-slate-600 px-6 py-4 flex items-center justify-between">
                  <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                    <Building2 size={20} />
                    {dept || 'Unassigned'}
                  </h2>
                
                  {dept && (
                    <button
                      onClick={() => deleteDepartment(dept)}
                      className="text-white hover:bg-red-600 hover:bg-opacity-20 rounded-lg p-2 transition-colors"
                      title="Delete Department"
                    >
                      <Trash size={20} />
                    </button>
                  )}
                </div>
                <div className="p-6 space-y-6">
                  {Object.entries(managerGroups).map(([manager, empList]) => {
                    const filtered = empList.filter(emp => filteredEmployees.includes(emp));
                    if (filtered.length === 0) return null;
                    
                    return (
                      <div key={manager} className="border-l-4 border-blue-500 pl-4">
                        <h3 className="text-sm font-semibold text-slate-600 mb-3">
                          Reports to: {manager || 'None'}
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                          {filtered.map(emp => (
                            <div
                              key={emp.id}
                              onClick={() => setSelectedItem({ type: 'employee', data: emp })}
                              className="bg-slate-50 rounded-lg p-4 hover:bg-slate-100 transition-colors cursor-pointer border border-slate-200"
                            >
                              <h4 className="font-semibold text-slate-800">{emp.name}</h4>
                              <p className="text-sm text-slate-600 mt-1">{emp.jobTitle}</p>
                              <div className="flex flex-wrap gap-2 mt-2">
                                {emp.topics.map(id => {
                                  const t = topics.find(x => x.id === id);
                                  return t ? (
                                    <span key={id} className="text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded">
                                      {t.name}
                                    </span>
                                  ) : null;
                                })}
                              
                                {emp.teams.map(id => {
                                  const tm = teams.find(x => x.id === id);
                                  return tm ? (
                                    <span key={id} className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded">
                                      {tm.name}
                                    </span>
                                  ) : null;
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Topics View */}
        {activeView === 'topics' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {topics.map(topic => (
              <div
                key={topic.id}
                onClick={() => setSelectedItem({ type: 'topic', data: topic })}
                className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 hover:shadow-md transition-shadow cursor-pointer"
              >
                <div className="flex items-start justify-between mb-3">
                  <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                    <Tag size={18} className="text-emerald-600" />
                    {topic.name}
                  </h3>
                  <span className="text-sm bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full">
                    {topic.experts.length} contact{topic.experts.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <p className="text-slate-600 text-sm">{topic.description}</p>
              </div>
            ))}
          </div>
        )}

        {/* Teams View */}
        {activeView === 'teams' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {teams.map(team => (
              <div
                key={team.id}
                onClick={() => setSelectedItem({ type: 'team', data: team })}
                className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 hover:shadow-md transition-shadow cursor-pointer"
              >
                <div className="flex items-start justify-between mb-3">
                  <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                    <Building2 size={18} className="text-purple-600" />
                    {team.name}
                  </h3>
                  <span className="text-sm bg-purple-100 text-purple-700 px-3 py-1 rounded-full">
                    {team.employees.length} member{team.employees.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <p className="text-slate-600 text-sm mb-3">{team.description}</p>
                {team.teamsLink && (
                  <a
                    href={team.teamsLink}
                    onClick={(e) => e.stopPropagation()}
                    className="text-blue-600 hover:text-blue-700 text-sm flex items-center gap-1"
                  >
                    <ExternalLink size={14} />
                    Teams Channel
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Detail Modal */}
      {selectedItem && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
            <div className="bg-gradient-to-r from-slate-700 to-slate-600 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-white">
                {selectedItem.data.name}
              </h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => openEditModal(selectedItem.data, selectedItem.type)}
                  className="text-white hover:bg-white hover:bg-opacity-20 rounded-lg p-2 transition-colors"
                  title="Edit"
                >
                  <Edit2 size={20} />
                </button>
                <button
                  onClick={() => {
                    if (selectedItem.type === 'employee') deleteEmployee(selectedItem.data.id);
                    if (selectedItem.type === 'topic') deleteTopic(selectedItem.data.id);
                    if (selectedItem.type === 'team') deleteTeam(selectedItem.data.id);
                  }}
                  className="text-white hover:bg-red-600 hover:bg-opacity-20 rounded-lg p-2 transition-colors"
                  title="Delete"
                >
                  <Trash size={20} />
                </button>
                <button
                  onClick={() => setSelectedItem(null)}
                  className="text-white hover:bg-white hover:bg-opacity-20 rounded-lg p-2 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
            </div>
            
            <div className="p-6 overflow-y-auto max-h-[calc(80vh-80px)]">
              {selectedItem.type === 'employee' && (
                <>
                  <div className="space-y-3 mb-6">
                    <p className="text-slate-600"><span className="font-semibold">Job Title:</span> {selectedItem.data.jobTitle}</p>
                    <p className="text-slate-600"><span className="font-semibold">Department:</span> {selectedItem.data.department}</p>
                    <p className="text-slate-600"><span className="font-semibold">Reports To:</span> {selectedItem.data.reportsTo}</p>
                  </div>

                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold text-slate-800">Linked Topics & Teams</h3>
                    <div className="flex items-center gap-2">
                      <button
                        className="bg-blue-600 text-white px-3 py-2 rounded-lg"
                        onClick={() => setMergeEmployee(selectedItem.data)}
                      >
                        Employee Merge
                      </button>
                      <button
                        onClick={() => setShowLinkModal(true)}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                      >
                        Add Link
                      </button>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <h4 className="text-sm font-semibold text-emerald-700 mb-2">Topics</h4>
                      <div className="space-y-2">
                        {(selectedItem.type === "topic"
                            ? selectedItem.data.experts || []
                            : selectedItem.type === "team"
                            ? selectedItem.data.employees || []
                            : []
                          ).map(topicId => {
                          const topic = topics.find(t => t.id === topicId);
                          return topic ? (
                            <div key={topicId} className="flex items-center justify-between bg-emerald-50 rounded-lg p-3">
                              <span className="text-slate-800">{topic.name}</span>
                              <button
                                onClick={() => {
                                  unlinkEmployeeFromItem(selectedItem.data.id, topicId, 'topic');
                                  setSelectedItem({
                                    ...selectedItem,
                                    data: {
                                      ...selectedItem.data,
                                      topics: selectedItem.data.topics.filter(id => id !== topicId)
                                    }
                                  });
                                }}
                                className="text-red-600 hover:text-red-700"
                              >
                                <X size={16} />
                              </button>
                            </div>
                          ) : null;
                        })}
                        {selectedItem.data.topics.length === 0 && (
                          <p className="text-slate-500 text-sm">No topics linked</p>
                        )}
                      </div>
                    </div>

                    <div>
                      <h4 className="text-sm font-semibold text-purple-700 mb-2">Tech Teams</h4>
                      <div className="space-y-2">
                        {(selectedItem.type === "topic"
                            ? selectedItem.data.experts || []
                            : selectedItem.type === "team"
                            ? selectedItem.data.employees || []
                            : []
                          ).map(teamId => {
                          const team = teams.find(t => t.id === teamId);
                          return team ? (
                            <div key={teamId} className="flex items-center justify-between bg-purple-50 rounded-lg p-3">
                              <span className="text-slate-800">{team.name}</span>
                              <button
                                onClick={() => {
                                  unlinkEmployeeFromItem(selectedItem.data.id, teamId, 'team');
                                  setSelectedItem({
                                    ...selectedItem,
                                    data: {
                                      ...selectedItem.data,
                                      teams: selectedItem.data.teams.filter(id => id !== teamId)
                                    }
                                  });
                                }}
                                className="text-red-600 hover:text-red-700"
                              >
                                <X size={16} />
                              </button>
                            </div>
                          ) : null;
                        })}
                        {selectedItem.data.teams.length === 0 && (
                          <p className="text-slate-500 text-sm">No teams linked</p>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              )}

              {(selectedItem.type === 'topic' || selectedItem.type === 'team') && (
                <>
                  <p className="text-slate-600 mb-6">{selectedItem.data.description}</p>
                  {selectedItem.type === 'team' && selectedItem.data.teamsLink && (
                    <a
                      href={selectedItem.data.teamsLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-700 flex items-center gap-2 mb-6"
                    >
                      <ExternalLink size={16} />
                      Open Teams Channel
                    </a>
                  )}
                  
                  <h3 className="text-lg font-semibold text-slate-800 mb-4">Contacts</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {(selectedItem.type === "topic"
                        ? selectedItem.data.experts || []
                        : selectedItem.type === "team"
                        ? selectedItem.data.employees || []
                        : []
                      ).map(empId => {
                      const emp = employees.find(e => e.id === empId);
                      return emp ? (
                        <div key={empId} className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                          <h4 className="font-semibold text-slate-800">{emp.name}</h4>
                          <p className="text-sm text-slate-600 mt-1">{emp.jobTitle}</p>
                          <p className="text-sm text-slate-500">{emp.department}</p>
                        </div>
                      ) : null;
                    })}
                    {(selectedItem.type === "topic"
                      ? (selectedItem.data.experts || []).length
                      : selectedItem.type === "team"
                      ? (selectedItem.data.employees || []).length
                      : 0
                    ) === 0 && (
                      <p className="text-slate-500 text-sm col-span-2">No contacts linked</p>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
            <div className="bg-gradient-to-r from-blue-600 to-blue-500 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-white">
                Create New {createType === 'employee' ? 'Employee' : createType === 'topic' ? 'Topic' : 'Tech Team'}
              </h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-white hover:bg-white hover:bg-opacity-20 rounded-lg p-2 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              {createType === 'employee' && (
                <>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Name *</label>
                    <input
                      type="text"
                      value={formData.name || ''}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="John Doe"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Job Title *</label>
                    <input
                      type="text"
                      value={formData.jobTitle || ''}
                      onChange={(e) => setFormData({...formData, jobTitle: e.target.value})}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Software Engineer"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Department *</label>
                    <input
                      type="text"
                      value={formData.department || ''}
                      onChange={(e) => setFormData({...formData, department: e.target.value})}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Engineering"
                      list="departments"
                    />
                    <datalist id="departments">
                      {departments.map(dept => <option key={dept} value={dept} />)}
                    </datalist>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Reports To</label>
                    <input
                      type="text"
                      value={formData.reportsTo || ''}
                      onChange={(e) => setFormData({...formData, reportsTo: e.target.value})}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Jane Smith"
                      list="managers"
                    />
                    <datalist id="managers">
                      {managers.map(mgr => <option key={mgr} value={mgr} />)}
                    </datalist>
                  </div>
                </>
              )}

              {createType === 'topic' && (
                <>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Topic Name *</label>
                    <input
                      type="text"
                      value={formData.name || ''}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="API Integration"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Description *</label>
                    <textarea
                      value={formData.description || ''}
                      onChange={(e) => setFormData({...formData, description: e.target.value})}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Questions about integrating with external APIs"
                      rows="3"
                    />
                  </div>
                </>
              )}

              {createType === 'team' && (
                <>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Team Name *</label>
                    <input
                      type="text"
                      value={formData.name || ''}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Platform Team"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Description *</label>
                    <textarea
                      value={formData.description || ''}
                      onChange={(e) => setFormData({...formData, description: e.target.value})}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Responsible for platform infrastructure and tooling"
                      rows="3"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Teams Channel Link</label>
                    <input
                      type="url"
                      value={formData.teamsLink || ''}
                      onChange={(e) => setFormData({...formData, teamsLink: e.target.value})}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="https://teams.microsoft.com/..."
                    />
                  </div>
                </>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={!formData.name || (createType === 'employee' && (!formData.jobTitle || !formData.department))}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:bg-slate-300 disabled:cursor-not-allowed"
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
            <div className="bg-gradient-to-r from-amber-600 to-amber-500 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-white">
                Edit {createType === 'employee' ? 'Employee' : createType === 'topic' ? 'Topic' : 'Tech Team'}
              </h2>
              <button
                onClick={() => setShowEditModal(false)}
                className="text-white hover:bg-white hover:bg-opacity-20 rounded-lg p-2 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              {createType === 'employee' && (
                <>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Name *</label>
                    <input
                      type="text"
                      value={formData.name || ''}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                      placeholder="John Doe"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Job Title *</label>
                    <input
                      type="text"
                      value={formData.jobTitle || ''}
                      onChange={(e) => setFormData({...formData, jobTitle: e.target.value})}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                      placeholder="Software Engineer"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Department *</label>
                    <input
                      type="text"
                      value={formData.department || ''}
                      onChange={(e) => setFormData({...formData, department: e.target.value})}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                      placeholder="Engineering"
                      list="departments-edit"
                    />
                    <datalist id="departments-edit">
                      {departments.map(dept => <option key={dept} value={dept} />)}
                    </datalist>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Reports To</label>
                    <input
                      type="text"
                      value={formData.reportsTo || ''}
                      onChange={(e) => setFormData({...formData, reportsTo: e.target.value})}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                      placeholder="Jane Smith"
                      list="managers-edit"
                    />
                    <datalist id="managers-edit">
                      {managers.map(mgr => <option key={mgr} value={mgr} />)}
                    </datalist>
                  </div>
                </>
              )}

              {createType === 'topic' && (
                <>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Topic Name *</label>
                    <input
                      type="text"
                      value={formData.name || ''}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                      placeholder="API Integration"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Description *</label>
                    <textarea
                      value={formData.description || ''}
                      onChange={(e) => setFormData({...formData, description: e.target.value})}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                      placeholder="Questions about integrating with external APIs"
                      rows="3"
                    />
                  </div>
                </>
              )}

              {createType === 'team' && (
                <>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Team Name *</label>
                    <input
                      type="text"
                      value={formData.name || ''}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                      placeholder="Platform Team"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Description *</label>
                    <textarea
                      value={formData.description || ''}
                      onChange={(e) => setFormData({...formData, description: e.target.value})}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                      placeholder="Responsible for platform infrastructure and tooling"
                      rows="3"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Teams Channel Link</label>
                    <input
                      type="url"
                      value={formData.teamsLink || ''}
                      onChange={(e) => setFormData({...formData, teamsLink: e.target.value})}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                      placeholder="https://teams.microsoft.com/..."
                    />
                  </div>
                </>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowEditModal(false)}
                  className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleEdit}
                  disabled={!formData.name || (createType === 'employee' && (!formData.jobTitle || !formData.department))}
                  className="flex-1 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors font-medium disabled:bg-slate-300 disabled:cursor-not-allowed"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Employee Merge Modal */}
      {mergeEmployee && (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-xl p-4 w-full max-w-md">
          <h3 className="text-lg font-semibold mb-4">
            Merge "{mergeEmployee.name}" into:
          </h3>
    
          <div className="max-h-64 overflow-y-auto space-y-2">
            {employees
              .filter(e => e.id !== mergeEmployee.id)
              .sort((a,b) => a.name.localeCompare(b.name))
              .map(e => (
                <button
                  key={e.id}
                  className="w-full text-left bg-gray-100 hover:bg-gray-200 p-2 rounded"
                  onClick={() => mergeEmployees(mergeEmployee.id, e.id)}
                >
                  {e.name} — {e.department || "Unassigned"}
                </button>
              ))}
          </div>
    
          <button
            className="mt-4 px-3 py-2 rounded bg-gray-400 text-white"
            onClick={() => setMergeEmployee(null)}
          >
            Cancel
          </button>
        </div>
      </div>
    )}

      {/* Link Modal */}
      {showLinkModal && selectedItem?.type === 'employee' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
            <div className="bg-gradient-to-r from-slate-700 to-slate-600 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-white">Add Link</h2>
              <button
                onClick={() => setShowLinkModal(false)}
                className="text-white hover:bg-white hover:bg-opacity-20 rounded-lg p-2 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-2">Topics</h3>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {topics.filter(t => !selectedItem.data.topics.includes(t.id)).map(topic => (
                    <button
                      key={topic.id}
                      onClick={() => {
                        linkEmployeeToItem(selectedItem.data.id, topic.id, 'topic');
                        setSelectedItem({
                          ...selectedItem,
                          data: {
                            ...selectedItem.data,
                            topics: [...selectedItem.data.topics, topic.id]
                          }
                        });
                      }}
                      className="w-full text-left bg-emerald-50 hover:bg-emerald-100 rounded-lg p-3 transition-colors"
                    >
                      {topic.name}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-2">Tech Teams</h3>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {teams.filter(t => !selectedItem.data.teams.includes(t.id)).map(team => (
                    <button
                      key={team.id}
                      onClick={() => {
                        linkEmployeeToItem(selectedItem.data.id, team.id, 'team');
                        setSelectedItem({
                          ...selectedItem,
                          data: {
                            ...selectedItem.data,
                            teams: [...selectedItem.data.teams, team.id]
                          }
                        });
                      }}
                      className="w-full text-left bg-purple-50 hover:bg-purple-100 rounded-lg p-3 transition-colors"
                    >
                      {team.name}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={() => setShowLinkModal(false)}
                className="w-full px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrgCommTool;
