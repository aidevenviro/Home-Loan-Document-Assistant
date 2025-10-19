import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Type } from "@google/genai";

type DocumentCategory = {
  category: string;
  documents: string[];
};

type FormEntry = {
  number: string;
  file: File | null;
  fileName?: string; // Used to display name from localStorage
};

type FormData = {
  [key: string]: FormEntry;
};

const LOCAL_STORAGE_KEY = 'homeLoanAppProgress';

const App = () => {
  const [employmentType, setEmploymentType] = useState('salaried');
  const [documentList, setDocumentList] = useState<DocumentCategory[]>([]);
  const [formData, setFormData] = useState<FormData>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFormValid, setIsFormValid] = useState(false);

  // Load state from localStorage on initial render
  useEffect(() => {
    try {
      const savedStateJSON = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (savedStateJSON) {
        const savedState = JSON.parse(savedStateJSON);
        setEmploymentType(savedState.employmentType || 'salaried');
        setDocumentList(savedState.documentList || []);
        setIsSubmitted(savedState.isSubmitted || false);
        
        // Restore form data, keeping file objects as null
        const restoredFormData: FormData = {};
        if (savedState.formData) {
           for (const key in savedState.formData) {
            restoredFormData[key] = {
              number: savedState.formData[key].number,
              file: null,
              fileName: savedState.formData[key].fileName,
            };
          }
        }
        setFormData(restoredFormData);
      }
    } catch (e) {
      console.error("Failed to load state from local storage", e);
    }
  }, []);

  // Save state to localStorage whenever it changes
  useEffect(() => {
    try {
      const serializableFormData: { [key: string]: { number: string; fileName: string | null } } = {};
      for (const key in formData) {
        serializableFormData[key] = {
          number: formData[key].number,
          fileName: formData[key].file ? formData[key].file.name : (formData[key].fileName || null),
        };
      }
      const stateToSave = {
        employmentType,
        documentList,
        formData: serializableFormData,
        isSubmitted,
      };
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(stateToSave));
    } catch (e) {
      console.error("Failed to save state to local storage", e);
    }
  }, [employmentType, documentList, formData, isSubmitted]);

  useEffect(() => {
    if (documentList.length === 0) {
      setIsFormValid(false);
      return;
    }
    const allDocs = documentList.flatMap(cat => cat.documents);
    const isValid = allDocs.every(doc => formData[doc]?.number && formData[doc]?.file);
    setIsFormValid(isValid);
  }, [formData, documentList]);

  const handleInputChange = (docName: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [docName]: { ...prev[docName], number: value },
    }));
  };

  const handleFileChange = (docName: string, file: File | null) => {
    setFormData(prev => ({
      ...prev,
      [docName]: { ...prev[docName], file: file, number: prev[docName]?.number || '', fileName: file?.name },
    }));
  };
  
  const handleClearFile = (docName: string) => {
    setFormData(prev => ({
      ...prev,
      [docName]: { ...prev[docName], file: null, fileName: undefined },
    }));
  };

  const generateDocumentList = async () => {
    setIsLoading(true);
    setError(null);
    setDocumentList([]);
    setFormData({});
    setIsSubmitted(false);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
      
      const prompt = `Act as a financial advisor in India. Provide a comprehensive list of documents required for a home loan for a '${employmentType}' individual. Organize the documents into logical categories. Only list the document names.`;
      
      const responseSchema = {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            category: {
              type: Type.STRING,
              description: 'The name of the document category (e.g., "Identity Proof").'
            },
            documents: {
              type: Type.ARRAY,
              items: {
                type: Type.STRING
              },
              description: 'A list of documents in this category.'
            }
          },
          required: ['category', 'documents']
        }
      };

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: responseSchema,
        },
      });

      const parsedResponse = JSON.parse(response.text);
      setDocumentList(parsedResponse);
    } catch (e) {
      console.error(e);
      setError("Failed to generate the document list. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Form Submitted:", formData);
    setIsSubmitted(true);
  };

  return (
    <>
      <header>
        <h1>Indian Home Loan Document Assistant</h1>
        <p>Select your employment type to get a personalized document checklist.</p>
      </header>

      <main>
        <div className="controls">
          <div className="employment-options" role="radiogroup" aria-labelledby="employment-type-label">
            <span id="employment-type-label" hidden>Employment Type</span>
            <input 
              type="radio" 
              id="salaried" 
              name="employmentType" 
              value="salaried" 
              checked={employmentType === 'salaried'} 
              onChange={() => setEmploymentType('salaried')} 
            />
            <label htmlFor="salaried">Salaried</label>

            <input 
              type="radio" 
              id="self-employed" 
              name="employmentType" 
              value="self-employed" 
              checked={employmentType === 'self-employed'} 
              onChange={() => setEmploymentType('self-employed')} 
            />
            <label htmlFor="self-employed">Self-Employed</label>
          </div>
          <button onClick={generateDocumentList} disabled={isLoading}>
            {isLoading ? 'Generating...' : 'Generate Checklist'}
          </button>
        </div>

        {isLoading && (
          <div className="loader" aria-label="Loading document checklist">
            <div className="spinner"></div>
          </div>
        )}
        
        {error && <div className="error" role="alert">{error}</div>}

        {isSubmitted && (
          <div className="success-message" role="alert">
            Application details captured successfully!
          </div>
        )}

        {documentList.length > 0 && !isSubmitted && (
          <form onSubmit={handleSubmit}>
            <section className="document-list" aria-live="polite">
              {documentList.map((category, index) => (
                <div key={index} className="category-card">
                  <h3>{category.category}</h3>
                  <ul>
                    {category.documents.map((doc, docIndex) => {
                      const currentDoc = formData[doc];
                      const fileName = currentDoc?.file?.name || currentDoc?.fileName;

                      return (
                      <li key={docIndex}>
                        <label htmlFor={`doc-number-${index}-${docIndex}`} className="doc-label">{doc}</label>
                        <div className="form-fields">
                          <input 
                            type="text" 
                            id={`doc-number-${index}-${docIndex}`} 
                            placeholder="Enter Document Number"
                            value={currentDoc?.number || ''}
                            onChange={(e) => handleInputChange(doc, e.target.value)}
                            required
                            aria-label={`${doc} Number`}
                          />
                          <div className="file-upload-wrapper">
                            <label htmlFor={`doc-file-${index}-${docIndex}`} className="file-upload-label">
                              Attach File
                            </label>
                            <input 
                              type="file" 
                              id={`doc-file-${index}-${docIndex}`}
                              onChange={(e) => handleFileChange(doc, e.target.files ? e.target.files[0] : null)}
                              onClick={(e: React.MouseEvent<HTMLInputElement>) => { (e.target as HTMLInputElement).value = '' }}
                              required={!fileName} // only required if no file is already "attached"
                              aria-label={`Attach ${doc} File`}
                            />
                            {fileName && (
                              <div className="file-info">
                                <span className="file-name" title={fileName}>
                                  {fileName}
                                </span>
                                <button 
                                  type="button" 
                                  onClick={() => handleClearFile(doc)} 
                                  className="clear-file-btn"
                                  aria-label={`Clear file for ${doc}`}
                                >
                                  Clear
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </li>
                    )})}
                  </ul>
                </div>
              ))}
            </section>
            <div className="submit-container">
              <button type="submit" className="submit-btn" disabled={!isFormValid}>
                Submit Application
              </button>
            </div>
          </form>
        )}
      </main>
    </>
  );
};

const container = document.getElementById('root');
const root = createRoot(container!);
root.render(<App />);